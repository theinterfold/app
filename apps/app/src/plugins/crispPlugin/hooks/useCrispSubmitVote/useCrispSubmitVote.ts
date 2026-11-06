'use client';

import { useEffect, useRef, useState } from 'react';
import { type Hex, isAddressEqual, size } from 'viem';
import {
    useSignTypedData,
    useSwitchChain,
    useWaitForTransactionReceipt,
    useWriteContract,
} from 'wagmi';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import type { VoteOption } from '@/plugins/tokenPlugin/types';
import { networkDefinitions } from '@/shared/constants/networkDefinitions';
import { crispService, useCrispVoteStatus } from '../../api/crispService';
import { crispProgramAbi } from '../../constants/crispProgramAbi';
import type { ICrispProposal } from '../../types';
import {
    CrispError,
    CrispMaskTarget,
    CrispSubmitVoteMethod,
} from '../../types';
import {
    crispBallotUtils,
    type ICrispCommitmentExpectation,
} from '../../utils/crispBallotUtils';
import {
    crispBallotWeightUtils,
    type ICrispBallotWeight,
} from '../../utils/crispBallotWeightUtils';
import { crispMaskUtils } from '../../utils/crispMaskUtils';
import { crispRoundUtils } from '../../utils/crispRoundUtils';
import { crispSdkUtils } from '../../utils/crispSdkUtils';
import { crispVoteUtils } from '../../utils/crispVoteUtils';
import { useCrispRound } from '../useCrispRound';
import { useCrispVotingPower } from '../useCrispVotingPower';

export enum CrispSubmitVoteStep {
    ENCRYPT = 'ENCRYPT',
    SIGN = 'SIGN',
    PROVE = 'PROVE',
    BROADCAST = 'BROADCAST',
}

export type CrispSubmitVoteState = 'idle' | 'pending' | 'success' | 'error';

interface IUseCrispSubmitVoteBaseParams {
    /**
     * Proposal to submit the ballot for.
     */
    proposal: ICrispProposal;
    /**
     * How the ballot reaches the chain. A mask written to a random member always goes through the
     * relay, whatever is set here.
     * @default CrispSubmitVoteMethod.RELAY
     */
    method?: CrispSubmitVoteMethod;
    /**
     * Defines if the ballot counts a random weight of up to 1% below the voting power, so the
     * published totals cannot be used to work out how voters voted (see `crispBallotWeightUtils`).
     * Does not apply to a mask, which counts nothing.
     * @default true
     */
    randomizeWeight?: boolean;
}

interface IUseCrispSubmitVoteVoteParams extends IUseCrispSubmitVoteBaseParams {
    /**
     * Vote option selected by the user.
     */
    voteOption: VoteOption;
    maskTarget?: undefined;
}

interface IUseCrispSubmitVoteMaskParams extends IUseCrispSubmitVoteBaseParams {
    /**
     * Whose slot to write a mask to. Submits a mask, a zero ballot that needs no signature, instead
     * of a vote.
     */
    maskTarget: CrispMaskTarget;
    /**
     * ID of the DAO the CRISP body belongs to, whose members a random mask target is drawn from.
     */
    daoId: string;
    voteOption?: undefined;
}

export type IUseCrispSubmitVoteParams =
    | IUseCrispSubmitVoteVoteParams
    | IUseCrispSubmitVoteMaskParams;

export interface IUseCrispSubmitVoteResult {
    /**
     * Submits the encrypted ballot, or the mask. Does nothing while a submission is already
     * running.
     */
    submitVote: () => void;
    /**
     * Step the flow is currently on.
     */
    activeStep: CrispSubmitVoteStep;
    /**
     * State of the active step.
     */
    state: CrispSubmitVoteState;
    /**
     * Hash of the transaction that carried the ballot, whichever path submitted it.
     */
    transactionHash?: string;
    /**
     * Error that interrupted the flow.
     */
    error?: Error;
    /**
     * Defines if the round is ready to accept ballots, which is when the ciphernode committee has
     * published its key.
     */
    isRoundReady: boolean;
    /**
     * Reason the CRISP server gave for not serving the round.
     */
    roundError?: Error;
    /**
     * Defines if the voting slot already holds an entry in the round, which a new ballot replaces.
     */
    hasActiveSlot: boolean;
    /**
     * Defines if the last submission replaced an entry of the slot of the voter with a vote.
     */
    isVoteUpdate: boolean;
    /**
     * Defines if the flow submits a mask, which has no signing step.
     */
    isMask: boolean;
    /**
     * Defines if the voter's wallet sends the commitment, either because the voter chose it or
     * because the CRISP server did not relay the ballot itself.
     */
    isWalletSubmission: boolean;
    /**
     * Share of the voting power the ballot counts, for example "99.47%". Undefined until the
     * voting power is read.
     */
    countedShare?: string;
    /**
     * Defines if the round state, the slot activity and the voting power are still being fetched.
     */
    isLoading: boolean;
}

/**
 * Drives the encrypted ballot flow against the CRISP program and server:
 *
 * 1. Encrypt the ballot under the committee key, after verifying the key against the commitment
 *    recorded on-chain.
 * 2. Sign the EIP-712 ballot digest read from the program.
 * 3. Prove the ballot with the signature.
 * 4. Stage it with the CRISP server, which signs the data-availability attestation `publishInput`
 *    requires. The server then relays the commitment, or hands the attested payload back and the
 *    wallet of the voter calls `publishInput` itself.
 *
 * A mask is a zero ballot written to the slot of the connected wallet or of a random eligible
 * member. It takes the same path, with the same digest, so it cannot be told apart from a vote
 * on-chain, except that nothing is signed.
 *
 * The wallet only sends the attested payload once it names the ballot built here, and a ballot is
 * only reported as submitted once the receipt of its transaction shows the `InputCommitted` or
 * `InputPublished` event for it.
 */
export const useCrispSubmitVote = (
    params: IUseCrispSubmitVoteParams,
): IUseCrispSubmitVoteResult => {
    const { proposal, randomizeWeight = true } = params;
    const { network, e3Id, pluginAddress } = proposal;

    const isMask = params.maskTarget != null;

    // A mask written to a random member is never sent from the wallet: its sender would not be the
    // slot, which tells a mask apart from the vote of the voter on-chain.
    const method =
        params.maskTarget === CrispMaskTarget.RANDOM
            ? CrispSubmitVoteMethod.RELAY
            : (params.method ?? CrispSubmitVoteMethod.RELAY);

    const { address, chainId: walletChainId } = useWalletAccount();
    const { id: chainId } = networkDefinitions[network];

    const { signTypedDataAsync } = useSignTypedData();
    const { mutateAsync: switchChainAsync } = useSwitchChain();
    const { writeContractAsync } = useWriteContract();

    const [activeStep, setActiveStep] = useState(CrispSubmitVoteStep.ENCRYPT);
    const [state, setState] = useState<CrispSubmitVoteState>('idle');
    const [error, setError] = useState<Error>();
    const [isVoteUpdate, setIsVoteUpdate] = useState(false);
    const [isWalletSubmission, setIsWalletSubmission] = useState(false);
    const [relayHash, setRelayHash] = useState<string>();
    const [walletHash, setWalletHash] = useState<Hex>();

    // What the receipt of the wallet submission must show, which only the run that sent it knows.
    const expectedCommitment = useRef<ICrispCommitmentExpectation | undefined>(
        undefined,
    );

    // The server can take minutes to choose who sends a ballot, so the wait can outlive the
    // dialog, and a wallet prompt must not open from a dialog the voter already left.
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;

        return () => {
            isMounted.current = false;
        };
    }, []);

    // The receipt settles a wallet submission. It is not handled by the pending transaction
    // manager of the app, which resumes interrupted transactions: the proof only lives in memory
    // and cannot be resumed after a reload.
    const { data: receipt, error: receiptError } = useWaitForTransactionReceipt(
        {
            hash: walletHash,
            chainId,
            query: { enabled: walletHash != null },
        },
    );

    useEffect(() => {
        if (walletHash == null) {
            return;
        }

        if (receipt != null && expectedCommitment.current != null) {
            try {
                crispBallotUtils.assertCommitted({
                    receipt,
                    expectation: expectedCommitment.current,
                });
                setState('success');
            } catch (commitmentError) {
                setError(commitmentError as Error);
                setState('error');
            }
        } else if (receiptError != null) {
            setError(receiptError);
            setState('error');
        }
    }, [walletHash, receipt, receiptError]);

    // The round is only known once the proposal is resolved on-chain.
    const hasRound = e3Id != null && e3Id !== '';
    const roundParams = { network, e3Id };

    const {
        roundState,
        roundError,
        isRoundReady,
        isLoading: isRoundLoading,
    } = useCrispRound(roundParams);

    const { data: voteStatus, isLoading: isVoteStatusLoading } =
        useCrispVoteStatus(
            { ...roundParams, address: address ?? '' },
            { enabled: hasRound && address != null && !isMask },
        );

    const hasActiveSlot = voteStatus?.slot_active ?? false;

    const {
        votingPower,
        isLoading: isVotingPowerLoading,
        refetch: refetchVotingPower,
    } = useCrispVotingPower({ proposal, address });

    // The weight is chosen once per review of the ballot and kept until the round, the voter, the
    // voting power or the randomization change, so a retry counts the same weight.
    const availablePower = votingPower?.ballotVotingPower;
    const [ballotWeight, setBallotWeight] = useState<ICrispBallotWeight>();

    useEffect(() => {
        if (
            isMask ||
            !hasRound ||
            address == null ||
            availablePower == null ||
            availablePower <= BigInt(0)
        ) {
            setBallotWeight(undefined);

            return;
        }

        setBallotWeight({
            roundId: e3Id,
            voter: address,
            available: availablePower,
            randomize: randomizeWeight,
            counted: crispBallotWeightUtils.chooseWeight(
                availablePower,
                randomizeWeight,
            ),
        });
    }, [address, availablePower, e3Id, hasRound, isMask, randomizeWeight]);

    const countedShare =
        ballotWeight != null && votingPower != null
            ? crispBallotWeightUtils.percentage({
                  counted: ballotWeight.counted,
                  unit: votingPower.votingPowerDivisor,
                  power: votingPower.rawVotingPower,
              })
            : undefined;

    const switchToDaoChain = async () => {
        if (walletChainId != null && walletChainId !== chainId) {
            await switchChainAsync({ chainId });
        }
    };

    const run = async () => {
        setError(undefined);
        setRelayHash(undefined);
        setWalletHash(undefined);
        expectedCommitment.current = undefined;
        setIsVoteUpdate(hasActiveSlot && !isMask);
        setIsWalletSubmission(method === CrispSubmitVoteMethod.DIRECT);
        setActiveStep(CrispSubmitVoteStep.ENCRYPT);
        setState('pending');

        try {
            if (address == null) {
                throw new CrispError(
                    'app.plugins.crisp.crispSubmitVoteDialog.error.walletNotConnected',
                );
            }

            if (roundState == null || !isRoundReady) {
                throw new CrispError(
                    'app.plugins.crisp.crispSubmitVoteDialog.error.roundNotAccepting',
                );
            }

            // E3 ids are around 1e76 and only become bigints for the contracts and the SDK.
            const roundId = BigInt(e3Id);
            const ownSlot = address as Hex;

            // A random mask target is drawn among the members of the body whose slot the program
            // accepts, so the draw can be refused as only the chain knows who is eligible.
            const slot =
                params.maskTarget === CrispMaskTarget.RANDOM
                    ? await crispMaskUtils.pickMaskTarget({
                          network,
                          daoId: params.daoId,
                          pluginAddress: pluginAddress as Hex,
                          e3Id: roundId,
                      })
                    : ownSlot;

            const context = await crispRoundUtils.readBallotContext({
                network,
                pluginAddress: pluginAddress as Hex,
                e3Id: roundId,
                slot,
                isOwnSlot: isAddressEqual(slot, ownSlot),
            });

            const publicKey = Uint8Array.from(roundState.committee_public_key);
            const preset = await crispSdkUtils.verifyCommitteeKey({
                network,
                publicKey,
                committeeKeyCommitment: context.committeeKeyCommitment,
                encodedParams: context.encodedParams,
            });

            let vote: number[];

            if (params.maskTarget != null) {
                vote = crispVoteUtils.buildMask();
            } else {
                // The ballot counts the weight reviewed in the dialog, rechecked against the
                // voting power the program reports now, while the proof names the full power.
                let countedWeight: bigint;

                try {
                    countedWeight = crispBallotWeightUtils.assertReviewed(
                        ballotWeight,
                        {
                            roundId: e3Id,
                            voter: address,
                            available: context.votingPower,
                        },
                    );
                } catch (reviewError) {
                    void refetchVotingPower();

                    throw reviewError;
                }

                vote = crispVoteUtils.buildBallot(
                    params.voteOption,
                    countedWeight,
                );
            }

            const prepared = await crispSdkUtils.prepareBallot({
                network,
                programAddress: context.programAddress,
                serverUrl: crispService.getServerUrl(network),
                e3Id: roundId,
                publicKey,
                preset,
                slotAddress: slot,
                vote,
                isMaskVote: isMask,
                votingPower: context.votingPower,
            });

            const digest = await crispRoundUtils.readBallotDigest({
                network,
                programAddress: context.programAddress,
                e3Id: roundId,
                slot,
                ciphertextCommitment: prepared.ctCommitment,
            });

            let encodedProof: Hex;

            if (params.maskTarget != null) {
                setActiveStep(CrispSubmitVoteStep.PROVE);

                encodedProof = await crispSdkUtils.finishMask({
                    prepared,
                    digest,
                });
            } else {
                setActiveStep(CrispSubmitVoteStep.SIGN);

                // The wallet only signs for the chain it is on, and a relayed ballot sends no
                // transaction that would switch it.
                await switchToDaoChain();

                const signature = await signTypedDataAsync(
                    crispBallotUtils.buildBallotSignatureRequest({
                        chainId,
                        crispProgram: context.programAddress,
                        e3Id: roundId,
                        slot,
                        ciphertextCommitment: prepared.ctCommitment,
                    }),
                );

                // The circuit verifies a plain 65-byte ECDSA signature, not the EIP-1271 answer of
                // a smart contract account.
                if (size(signature) !== 65) {
                    throw new CrispError(
                        'app.plugins.crisp.crispSubmitVoteDialog.error.smartContractSignature',
                    );
                }

                setActiveStep(CrispSubmitVoteStep.PROVE);

                encodedProof = await crispSdkUtils.finishBallot({
                    prepared,
                    digest,
                    signature,
                });
            }

            // What the chain must show for this ballot, whoever sends it.
            const expectation: ICrispCommitmentExpectation = {
                programAddress: context.programAddress,
                e3Id: roundId,
                identity: await crispSdkUtils.decodeInputIdentity(encodedProof),
            };

            setActiveStep(CrispSubmitVoteStep.BROADCAST);

            // Both paths stage the ballot with the server first, as only it can sign the
            // availability attestation.
            const view = await crispService.broadcastBallot({
                network,
                e3Id,
                encodedProof,
                sendFromWallet: method === CrispSubmitVoteMethod.DIRECT,
            });
            setRelayHash(crispBallotUtils.parseTransactionHash(view.tx_hash));

            const step = await crispBallotUtils.followStagedBallot({
                network,
                view,
                isCancelled: () => !isMounted.current,
                onView: (job) =>
                    setRelayHash(
                        crispBallotUtils.parseTransactionHash(job.tx_hash),
                    ),
            });

            if (step == null || !isMounted.current) {
                return;
            }

            if (step.action === 'committed') {
                // The server saying the commitment is on-chain is not enough, a ballot is only
                // reported as submitted once the chain shows it.
                if (step.transactionHash == null) {
                    throw new CrispError(
                        'app.plugins.crisp.crispSubmitVoteDialog.error.commitmentUnconfirmed',
                    );
                }

                await crispBallotUtils.confirmRelayedCommitment({
                    network,
                    transactionHash: step.transactionHash,
                    expectation,
                });

                if (isMounted.current) {
                    setState('success');
                }

                return;
            }

            if (params.maskTarget === CrispMaskTarget.RANDOM) {
                throw new CrispError(
                    'app.plugins.crisp.crispSubmitVoteDialog.error.maskNotRelayed',
                );
            }

            // The wallet sends the payload attested by the server, which must be the ballot built
            // above and not another one.
            crispBallotUtils.assertAttestedPayload({
                identity: expectation.identity,
                payload: step.payload,
            });

            setIsWalletSubmission(true);
            await switchToDaoChain();

            const hash = await writeContractAsync({
                address: context.programAddress,
                chainId,
                abi: crispProgramAbi,
                functionName: 'publishInput',
                args: [roundId, step.payload],
            });

            expectedCommitment.current = expectation;
            setWalletHash(hash);
        } catch (submitError) {
            setError(crispBallotUtils.describeFailure(submitError));
            setState('error');
        }
    };

    const submitVote = () => {
        if (state !== 'pending') {
            void run();
        }
    };

    return {
        submitVote,
        activeStep,
        state,
        transactionHash: walletHash ?? relayHash,
        error,
        isRoundReady,
        roundError,
        hasActiveSlot,
        isVoteUpdate,
        isMask,
        isWalletSubmission,
        countedShare,
        isLoading:
            isRoundLoading || isVoteStatusLoading || isVotingPowerLoading,
    };
};
