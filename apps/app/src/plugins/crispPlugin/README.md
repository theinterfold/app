# CRISP plugin

CRISP proposals are ordinary proposals whose ballots are encrypted. The backend only supplies the
proposal, including what the indexer reads from the `CrispVoting` plugin and the Interfold
coordinator (the round, the thresholds, the tally and the failure of the round). The app only reads
the round state it needs to vote from the CRISP server (`api/crispService`) and from the chain
(`utils/crispRoundUtils`). A proposal still renders, with an "encrypted" tally, while the backend has
not indexed its round.

## Data sources

`B` = backend, `C` = CRISP server.

| Field                                            | Source | Where from                                                                        |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------- |
| title, summary, dates, creator, `hasActions`     | B      | proposal (`hasActions` are the actions of the SPP when the body is staged)        |
| `e3Id`                                           | B      | `getProposal(proposalId).e3Id`, indexed at `ProposalCreated`                      |
| `settings.minParticipation`, `supportThreshold`  | B      | `getProposal().parameters`, a percentage                                          |
| `settings.minVoterVotingPower`                   | B      | `getProposal().parameters.minVotingPower`                                         |
| `settings.minProposerVotingPower`, `minDuration` | B      | proposal settings                                                                 |
| `settings.token`                                 | B      | proposal                                                                          |
| `settings.historicalTotalSupply`                 | B      | `totalVotingPower(snapshot)`, the quorum denominator                              |
| `isTallyPublished`, `metrics.votesByOption`      | B      | Interfold `PlaintextOutputPublished` and the plugin `getTally`, or the executed   |
| `failureReason`                                  | B      | Interfold `E3Failed`, absent while the round has not failed                       |
| `votingPowerDivisor`                             | B      | `votingPowerDivisorOf(e3Id)` on the CRISP program of the round                    |
| round status, committee key                      | C      | `state/lite`, only used to know when a voter can vote                             |

The backend serves the CRISP-specific fields with the names, types and units of `ICrispProposal`,
so the components and `crispProposalUtils` (status, quorum, support) read them straight from the
proposal and the app makes no chain read to display a proposal. `useCrispProposal` polls the
backend proposal every 15 seconds until it is settled (executed, `failureReason` set or
`isTallyPublished`) and invalidates the indexed proposal queries when it settles.

A round whose deadline passed without anyone marking it as failed on the coordinator emits no
event, so the backend reports it as not failed until `E3Failed` is emitted and the lists show the
proposal as pending until someone marks it. The proposal page detects it on-chain: while the
proposal is unsettled, `useCrispProposal` also asks the coordinator (`interfold()` of the plugin,
then `checkFailureCondition(e3Id)`, `crispRefundUtils.fetchFailureCondition`) every 15 seconds and
sets `failureReason` from its answer when the backend has none. The refund card then shows and
offers the marking step (`markE3Failed`). A settled proposal, or one whose `failureReason` the
backend serves, reads nothing. Once the proposal shows as failed, the refund flow (`useCrispRefund`,
`crispRefundUtils`) checks the round and the refund on-chain itself.

## Units

- The server encodes voting power as `floor(balance / divisor)`, so tally counts are in vote units
  while `totalVotingPower` is in raw token units. The divisor is read per round,
  `votingPowerDivisorOf(e3Id)` on the CRISP program, and is never defaulted: without it the
  proposal stays unresolved (`crispProposalUtils.isTallyResolved`).
- `metrics.votesByOption[].totalVotingPower` is served in raw token units (count * divisor), as the
  UI components format it with the decimals of the token.
- Percentages are whole numbers out of 100 (not ppm). The math lives in `crispProposalUtils` and
  mirrors `_hasSucceeded`: quorum is `totalVotes * divisor * 100 >= minParticipation * totalVotingPower`
  and support requires yes to strictly exceed it, `(100 - t) * yes > t * no`, abstentions excluded.
  Quorum applies to signaling proposals too.

## Failed rounds and refunds

A round fails when the coordinator marks it `Failed`, which the backend indexes as `E3Failed`. The
proposal then gets the terminal `ProposalStatus.FAILED` and never publishes a tally. A round whose
deadline passed without being marked shows as failed too: the backend asks the coordinator
(`checkFailureCondition`) and stores the reason it would be marked with. The fee is
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
  step when the credit does not cover the quote (`useCrispCreateProposalPrerequisiteSteps`), for a
  proposal created directly and through a staged process alike. The step names the amount it
  deposits, and the fee card of the creation wizard announces it beforehand.
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
- `DIRECT`: the voter calls `CRISPProgram.publishInput(e3Id, payload)` and pays the gas. The server
  still stages the ballot and signs the attestation, so it can refuse to process it.

The wallet sends the attested payload returned by the server, not the SDK proof, and only after
`crispBallotUtils.assertAttestedPayload` has checked that it carries the input identity (slot,
ciphertext commitment, ciphertext hash, parent) of the proof the voter built. The SDK
`decodeInputIdentity` reads the local envelope, the attested payload has two more fields (expiry and
attestation signature, the layout `publishInput` decodes), so it is decoded with its own ABI. A job
that already reports a transaction hash is never sent again.

A ballot is reported as submitted only once the chain shows it: the receipt of the wallet
transaction, or of the `tx_hash` the server reports on the relay path (`confirmRelayedCommitment`),
must be a success that holds an event of `CRISPProgram` for this round, the slot and the ciphertext
commitment of the voter's own proof: `InputCommitted`, or `InputPublished`, which `finalizeInput`
only emits for an input committed with the same identity. The server reports the publication
transaction once it sends it, so a relayed ballot can be confirmed by either. A relayed job
without a transaction hash cannot be confirmed and fails. The hash is validated before it is read
or linked to. The round must be `Active` with the committee key published and the on-chain input
window open, which is checked before the slow proving starts.

The round id is a decimal string end to end (ids are around 1e76) and only becomes a `bigint` for
contract and SDK calls. The CRISP program is resolved from the chain: `plugin.interfold()` then
`getE3(e3Id).e3Program`.

**Round reads.** `readE3Record` refuses a plugin whose `interfold()` is not the
`crispE3Config[network].interfoldAddress`, so the program of a round is only resolved through the
configured coordinator. `crispE3Config[network].allowedPresets` lists the circuit presets a round
may run under, and `verifyCommitteeKey` refuses any other. Sepolia allows `insecure-64`, a network
with real value at stake must not list it.

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
runs the vote flow without the sign step (encrypt, prove, broadcast), so the broadcast and the job
follow-up are the vote ones and hit the server with the same requests. What differs:

- The ballot is `crispVoteUtils.buildMask()`, zero on each of the three options, prepared with
  `isMaskVote: true` for the slot of the target and the voting power of **that slot**
  (`votingPowerOf(e3Id, target)`), which the proof takes as public input. The digest is read from
  `CRISPProgram.ballotDigest` for the target slot as for a vote, and `crispSdkUtils.finishMask`
  proves it with no signature.
- `CRISPProgram` refuses a mask to a slot below the divisor of the round (`SlotNotEligible`), so
  the target must hold voting power. `readBallotContext` checks it before the slow proving starts,
  with a wording that fits an own slot and someone else's.
- A mask of a random member is **never sent from the wallet**: its sender would not be the slot,
  which tells it apart from a vote. The dialog does not offer `DIRECT` for it, the hook relays it
  whatever method is asked for, and when the relay hands the payload back the flow fails with
  `maskNotRelayed` instead of sending. A mask of the own slot keeps both paths, as sender and slot
  are the same. The connected address is not looked up on the CRISP server in mask mode
  (`useCrispVoteStatus` is disabled), as its `slot_active` hint is a vote-only concept.
- The members of a random target come from the member list of the backend for the body
  (`governanceService.getMemberList` with `daoId` and `pluginAddress`), read page by page. A target
  is drawn with `crypto.getRandomValues` and rejection sampling (`crispMaskUtils.drawIndex`), so
  the draw has no modulo bias. Eligibility is then read on-chain and an ineligible draw is redrawn
  from the remaining members, which keeps the pick uniform over the eligible ones. A body with no
  member, or none with voting power, fails before anything is encrypted.

The weight randomization does not apply to a mask, which counts nothing.

## Security notes

What the app verifies, and what it takes from the CRISP server or the governance backend.

- **Verified on-chain or locally:** the committee key against its on-chain commitment, the
  coordinator of the plugin against `crispE3Config`, the circuit preset against the network, the
  slot head the ballot extends, the identity of the attested payload against the ballot the wallet
  built, and the `InputCommitted` or `InputPublished` event against the same identity before
  success is reported.
- **Slot head.** The previous ciphertext a ballot is added to (its `parentIndexPlusOne`) is
  resolved by the SDK `getSlotHead` from the `InputCommitted` and `InputPublished` events of the
  program, read through the RPC proxy, rather than from the server's `previous-ciphertext`. A ballot
  built on a stale head would be committed and then dropped from the tally. Only the bytes of the
  head come from the server's availability store (`/availability`), and they are checked against
  the on-chain hash, so the server can withhold them, which fails the ballot, but not substitute
  them. The server can also refuse to stage or attest a ballot on either path.
- **Member list.** The random mask target is drawn from the member list read from the governance
  backend, which therefore sees that a mask is being prepared for the body and when. The draw itself
  stays in the browser, and the target is checked on-chain. The read is capped at 100 pages of 50
  members, beyond which the flow fails instead of paging on.
- **Relay timing.** The server that relays a ballot sees the slot, the ciphertext and the time of
  every ballot it stages, with a vote or a mask alike.
- **Pinned SDK.** `@crisp-e3/sdk` is pinned to an exact version, as it builds the proofs and
  envelopes the wallet signs and sends.
