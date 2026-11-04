# CRISP plugin

CRISP proposals are ordinary proposals whose ballots are encrypted. The backend only supplies the
generic proposal (metadata, dates, creator, actions), everything CRISP-specific is resolved by the
plugin: on-chain reads of the `CrispVoting` plugin and the CRISP server (`api/crispService`). A
proposal still renders, with an "encrypted" tally, when those sources are unreachable.

## Data sources

`B` = backend, `C` = CRISP server, `X` = on-chain read of the `CrispVoting` plugin.

| Field                                            | Source | Where from                                                                         |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------- |
| title, summary, dates, creator, `hasActions`     | B      | proposal (`hasActions` are the actions of the SPP when the body is staged)         |
| `e3Id`                                           | X      | `getProposal(proposalId).e3Id`                                                     |
| `settings.minParticipation`                      | X      | `getProposal().parameters`, a percentage                                           |
| `settings.supportThreshold`                      | X      | `getProposal().parameters`, a percentage                                           |
| `settings.minVoterVotingPower`                   | X      | `getProposal().parameters.minVotingPower`                                          |
| `settings.minProposerVotingPower`, `minDuration` | B      | proposal settings, not re-read on-chain                                            |
| `settings.token`                                 | B      | proposal, with `decimals` read on-chain                                            |
| `settings.historicalTotalSupply`                 | X      | `totalVotingPower(snapshot)`, the quorum denominator                               |
| `isTallyPublished`, `metrics.votesByOption`      | X      | `getTally(proposalId)` (reverts until published) or the stored tally once executed |
| `failureReason`                                  | X      | coordinator `getE3Stage` / `getFailureReason` / `checkFailureCondition`            |
| round status, committee key                      | C      | `state/lite`, only used to know when a voter can vote                              |

The tally is read on-chain rather than from the server because execution keys on the chain, and an
executed proposal freezes its tally there.

`utils/crispProposalResolverUtils` resolves these reads. It is registered on the
`GOVERNANCE_RESOLVE_PROPOSAL` slot, which `governanceService` calls for CRISP proposals and the
CRISP sub-proposals of staged processes, and `useCrispProposal` applies it on the proposal page,
polling until the tally is published, the proposal is executed or its round failed.

## Units

- The server encodes voting power as `floor(balance / divisor)`, so tally counts are in vote units
  while `totalVotingPower` is in raw token units. The divisor is read per round,
  `votingPowerDivisorOf(e3Id)` on the CRISP program, and is never defaulted: without it the
  proposal stays unresolved.
- `metrics.votesByOption[].totalVotingPower` is in raw token units (count * divisor), as the UI
  components format it with the decimals of the token.
- Percentages are whole numbers out of 100 (not ppm). The math lives in `crispProposalUtils` and
  mirrors `_hasSucceeded`: quorum is `totalVotes * divisor * 100 >= minParticipation * totalVotingPower`
  and support requires yes to strictly exceed it, `(100 - t) * yes > t * no`, abstentions excluded.
  Quorum applies to signaling proposals too.
- `getProposal().tally` is zeroed until `execute` stores it, so it is only trusted when executed.

## Failed rounds and refunds

A round fails when the coordinator marks it `Failed` or a deadline passed that nobody marked yet.
The proposal then gets the terminal `ProposalStatus.FAILED` and never publishes a tally. The fee is
returned in up to three permissionless transactions: `markE3Failed`, `processE3Failure` (both on
the coordinator) and `claimRefund(proposalId)` (plugin), which credits the payer recorded at
creation. The proposal page offers the next step to the payer (`utils/crispRefundUtils`) and then
the withdrawal of the fee credit, which the fee card of the creation wizard offers as well.

## Install, creation and staged processes

- Install data is `[pluginInitParams, token, grantExecuteOnDao]`. The token must be an existing
  IVotes token (it is not created, minted nor wrapped) and `grantExecuteOnDao` is `false` for a body
  of a staged process. The setup installs no condition, so a body cannot restrict proposal creation
  in a staged process.
- The creator pays the E3 fee from a credit held on the plugin. The publish dialog adds a top-up
  step when the credit does not cover the quote (`useCrispCreateProposalPrerequisiteSteps`).
  Quotes follow the window the contract derives: `quoteProposalFeeForDuration(stageDuration)` per
  stage of a staged process, otherwise `quoteProposalFee(startDate, endDate)` with the same dates
  `createProposal` is sent.
- `createProposal` takes `abi.encode(uint256 allowFailureMap)` as data. A staged process builds it
  through the `GOVERNANCE_BUILD_CREATE_PROPOSAL_PARAMS` slot.
- `execute` is permissionless, so `GOVERNANCE_EXECUTE_CHECK_VERSION_SUPPORTED` returns `false`.
- The CRISP server URL is `NEXT_PUBLIC_CRISP_SERVER_URL`, see `crispE3Config`.

## Ballot submission

CRISP options are positional (`0 = yes, 1 = no, 2 = abstain`), always three, while the app works in
`VoteOption`. `utils/crispVoteUtils` converts both ways.

`useCrispSubmitVote` runs four steps:

1. **Encrypt**: reads the round from the chain (`utils/crispRoundUtils`), verifies the committee
   key and encrypts the ballot with the voting power of the voter (`CRISPProgram.votingPowerOf`).
2. **Sign**: the voter signs the EIP-712 ballot digest read from `CRISPProgram.ballotDigest`, which
   binds the ballot to the round, the slot and the ciphertext, so encryption comes first.
3. **Prove**: `crispSdkUtils.finishBallot` proves the ballot. The circuit verifies a plain ECDSA
   signature, so smart-contract wallets (EIP-1271) are refused before proving starts.
4. **Broadcast**: stages the proof on `POST /voting/broadcast` and reads the job until the server
   has decided who sends the commitment.

A ballot can be replaced while the round is open. The server only reports whether the voting slot
holds an entry (`slot_active`), which can be an earlier ballot or a privacy mask, so the dialog
never claims that the voter already voted.

**Eligibility.** Rounds use the `ONCHAIN` census: there is no voter list, the program reads the
power itself. A voter is eligible when `votingPowerOf(e3Id, voter) > 0` and their power at
`snapshotOf(e3Id)` is at least `max(minVoterVotingPower, votingPowerDivisorOf(e3Id))`. The permission
check and the submit flow read the same values. Voting powers above `Number.MAX_SAFE_INTEGER` are
refused as the SDK takes `number` weights.

**Randomized weight.** Public voting powers and published totals per option would let someone
solve for how voters voted, so the ballot counts by default a random whole number of units at most
1% below the voting power (`utils/crispBallotWeightUtils`). The dialog switch counts the whole
power instead. The weight is kept while the round, voter, power and switch are unchanged and is
rechecked against the voting power read at submission.

**Committee key.** The key served on `state/lite` is only a transport value. Its commitment is
recomputed with `@interfold/wasm` and compared with `getE3(e3Id).committeePublicKey` before anything
is encrypted to it. The same parameters select the circuit preset.

**Submission paths.** The server always stages the ballot first, as only it can sign the
availability attestation `publishInput` requires. The voter then picks who sends the commitment:

- `RELAY` (default): the server sends it, free for the voter. If it cannot, the job becomes
  `ready_for_commitment` and the voter's wallet sends it as in `DIRECT`.
- `DIRECT`: the voter calls `CRISPProgram.publishInput(e3Id, payload)` and pays the gas.

The wallet sends the attested payload returned by the server, not the SDK proof. A job that already
reports a transaction hash is never sent again. The round must be `Active` with the committee key
published and the on-chain input window open, which is checked before the slow proving starts.

The round id is a decimal string end to end (ids are around 1e76) and only becomes a `bigint` for
contract and SDK calls. The CRISP program is resolved from the chain: `plugin.interfold()` then
`getE3(e3Id).e3Program`.

**SDK loading.** `@crisp-e3/sdk` and `@interfold/wasm` initialise WASM at import and weigh
megabytes, so `crispSdkUtils` is the only importer and does it dynamically inside the call, which
keeps them out of the initial bundle and SSR. In-browser proving loads its circuit from a `data:`
URI, which the CSP allows (see `proxyUtils`).

## Masking

A mask is a zero ballot that anyone can write, unsigned, to any eligible voting slot, so an observer
of the chain cannot tell whether an address really voted: a vote, an update and a mask look the
same on-chain. A mask never changes a vote, as the SDK adds the zero ballot to the ciphertext
already in the slot. The vote area offers two actions next to **Vote**, only while the round takes
ballots and a wallet is connected:

- **Mask a voter** (`CrispMaskTarget.RANDOM`) writes the mask to a uniformly random member of the
  body.
- **Mask my slot** (`CrispMaskTarget.SELF`) writes it to the slot of the connected wallet, which
  needs voting power in the round.

Both open the submit dialog in mask mode: `useCrispSubmitVote({ proposal, maskTarget, daoId })`
runs the vote flow without the sign step (encrypt, prove, broadcast), so the broadcast, the job
follow-up and the wallet fallback are the vote ones and hit the server with the same requests. What
differs:

- The ballot is `crispVoteUtils.buildMask()`, zero on each of the three options, prepared with
  `isMaskVote: true` for the slot of the target and the voting power of **that slot**
  (`votingPowerOf(e3Id, target)`), which the proof takes as public input. The digest is read from
  `CRISPProgram.ballotDigest` for the target slot as for a vote, and `crispSdkUtils.finishMask`
  proves it with no signature.
- `CRISPProgram` refuses a mask to a slot below the divisor of the round (`SlotNotEligible`), so
  the target must hold voting power. `readBallotContext` checks it before the slow proving starts,
  with a wording that fits an own slot and someone else's.
- The members of a random target come from the member list of the backend for the body
  (`governanceService.getMemberList` with `daoId` and `pluginAddress`), read page by page. A target
  is drawn with `crypto.getRandomValues` and rejection sampling (`crispMaskUtils.drawIndex`), so
  the draw has no modulo bias. Eligibility is then read on-chain and an ineligible draw is redrawn
  from the remaining members, which keeps the pick uniform over the eligible ones. A body with no
  member, or none with voting power, fails before anything is encrypted.

The weight randomization does not apply to a mask, which counts nothing.
