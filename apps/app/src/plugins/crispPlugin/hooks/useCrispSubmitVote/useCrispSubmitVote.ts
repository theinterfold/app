'use client';

import { useEffect, useRef, useState } from 'react';
import { type Hex, size } from 'viem';
import {
    useSignTypedData,
    useSwitchChain,
    useWaitForTransactionReceipt,
    useWriteContract,
} from 'wagmi';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import type { VoteOption } from '@/plugins/tokenPlugin/types';
import { networkDefinitions } from '@/shared/constants/networkDefinitions';
import {
    crispService,
    type ICrispRoundState,
    useCrispRoundState,
    useCrispVoteStatus,
} from '../../api/crispService';
import { crispE3Config } from '../../constants/crispE3Config';
import { crispProgramAbi } from '../../constants/crispProgramAbi';
import type { ICrispProposal } from '../../types';
import { CrispSubmitVoteMethod } from '../../types';
import { crispBallotUtils } from '../../utils/crispBallotUtils';
import {
    crispBallotWeightUtils,
    type ICrispBallotWeight,
} from '../../utils/crispBallotWeightUtils';
import { crispRoundUtils } from '../../utils/crispRoundUtils';
import { crispSdkUtils } from '../../utils/crispSdkUtils';
import { crispVoteUtils } from '../../utils/crispVoteUtils';
import { useCrispVotingPower } from '../useCrispVotingPower';

const roundStatePollInterval = 10_000;

export enum CrispSubmitVoteStep {
    ENCRYPT = 'ENCRYPT',
    SIGN = 'SIGN',
    PROVE = 'PROVE',
    BROADCAST = 'BROADCAST',
}

export type CrispSubmitVoteState = 'idle' | 'pending' | 'success' | 'error';

export interface IUseCrispSubmitVoteParams {
    /**
     * Proposal to submit the ballot for.
     */
    proposal: ICrispProposal;
    /**
     * Vote option selected by the user.
     */
    voteOption: VoteOption;
    /**
     * How the ballot reaches the chain.
     * @default CrispSubmitVoteMethod.RELAY
     */
    method?: CrispSubmitVoteMethod;
    /**
     * Defines if the ballot counts a random weight of up to 1% below the voting power, so the
     * published totals cannot be used to work out how voters voted (see `crispBallotWeightUtils`).
     * @default true
     */
    randomizeWeight?: boolean;
}

export interface IUseCrispSubmitVoteResult {
    /**
     * Submits the encrypted ballot. Does nothing while a submission is already running.
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
     * Defines if the last submission replaced an entry of the slot.
     */
    isVoteUpdate: boolean;
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

const isRoundOpen = (round?: ICrispRoundState) =>
    round?.status === 'Active' && round.committee_public_key.length > 0;

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
 * The attested payload, not the proof of the SDK, is what reaches the contract on either path.
 */
export const useCrispSubmitVote = (
    params: IUseCrispSubmitVoteParams,
): IUseCrispSubmitVoteResult => {
    const {
        proposal,
        voteOption,
        method = CrispSubmitVoteMethod.RELAY,
        randomizeWeight = true,
    } = params;
    const { network, e3Id, pluginAddress } = proposal;

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

        if (receipt?.status === 'success') {
            setState('success');
        } else if (receipt?.status === 'reverted') {
            setError(new Error('The transaction reverted.'));
            setState('error');
        } else if (receiptError != null) {
            setError(receiptError);
            setState('error');
        }
    }, [walletHash, receipt, receiptError]);

    // The round is only known once the proposal is resolved on-chain.
    const hasRound = e3Id != null && e3Id !== '';
    const roundParams = { network, e3Id };

    // The committee publishes its key some way into the round, so the round is polled until it is
    // ready: the server answers 404 until then.
    const {
        data: roundState,
        error: roundError,
        isLoading: isRoundLoading,
    } = useCrispRoundState(roundParams, {
        enabled: hasRound,
        refetchInterval: (query) =>
            isRoundOpen(query.state.data) ? false : roundStatePollInterval,
    });

    const { data: voteStatus, isLoading: isVoteStatusLoading } =
        useCrispVoteStatus(
            { ...roundParams, address: address ?? '' },
            { enabled: hasRound && address != null },
        );

    const hasActiveSlot = voteStatus?.slot_active ?? false;
    const isRoundReady = isRoundOpen(roundState);

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
    }, [address, availablePower, e3Id, hasRound, randomizeWeight]);

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
        setIsVoteUpdate(hasActiveSlot);
        setIsWalletSubmission(method === CrispSubmitVoteMethod.DIRECT);
        setActiveStep(CrispSubmitVoteStep.ENCRYPT);
        setState('pending');

        try {
            if (address == null) {
                throw new Error('Connect your wallet to submit a ballot.');
            }

            if (roundState == null || !isRoundReady) {
                throw new Error(
                    'This round is not accepting ballots yet. Please wait and try again.',
                );
            }

            // E3 ids are around 1e76 and only become bigints for the contracts and the SDK.
            const roundId = BigInt(e3Id);
            const slot = address as Hex;

            const context = await crispRoundUtils.readBallotContext({
                network,
                pluginAddress: pluginAddress as Hex,
                e3Id: roundId,
                slot,
            });

            const publicKey = Uint8Array.from(roundState.committee_public_key);
            const preset = await crispSdkUtils.verifyCommitteeKey({
                publicKey,
                committeeKeyCommitment: context.committeeKeyCommitment,
                encodedParams: context.encodedParams,
            });

            // The ballot counts the weight reviewed in the dialog, rechecked against the voting
            // power the program reports now, while the proof names the full power.
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

            const prepared = await crispSdkUtils.prepareBallot({
                // The round state was served by the CRISP server of the network.
                serverUrl: crispE3Config[network]!.serverUrl,
                e3Id: roundId,
                publicKey,
                preset,
                slotAddress: slot,
                vote: crispVoteUtils.buildBallot(voteOption, countedWeight),
                votingPower: context.votingPower,
            });

            const digest = await crispRoundUtils.readBallotDigest({
                network,
                programAddress: context.programAddress,
                e3Id: roundId,
                slot,
                ciphertextCommitment: prepared.ctCommitment,
            });

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

            // The circuit verifies a plain 65-byte ECDSA signature, not the EIP-1271 answer of a
            // smart contract account.
            if (size(signature) !== 65) {
                throw new Error(
                    'This wallet signed with a smart-contract signature (for example a Safe), which encrypted ballots do not support yet. Vote from a wallet with its own key.',
                );
            }

            setActiveStep(CrispSubmitVoteStep.PROVE);

            const encodedProof = await crispSdkUtils.finishBallot({
                prepared,
                digest,
                signature,
            });

            setActiveStep(CrispSubmitVoteStep.BROADCAST);

            // Both paths stage the ballot with the server first, as only it can sign the
            // availability attestation.
            const view = await crispService.broadcastBallot({
                network,
                e3Id,
                encodedProof,
                sendFromWallet: method === CrispSubmitVoteMethod.DIRECT,
            });
            setRelayHash(view.tx_hash ?? undefined);

            const step = await crispBallotUtils.followStagedBallot({
                network,
                view,
                isCancelled: () => !isMounted.current,
                onView: (job) => setRelayHash(job.tx_hash ?? undefined),
            });

            if (step == null || !isMounted.current) {
                return;
            }

            if (step.action === 'committed') {
                setState('success');

                return;
            }

            // The wallet sends the payload attested by the server, never the proof built above.
            setIsWalletSubmission(true);
            await switchToDaoChain();

            const hash = await writeContractAsync({
                address: context.programAddress,
                chainId,
                abi: crispProgramAbi,
                functionName: 'publishInput',
                args: [roundId, step.payload],
            });

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
        roundError: roundError ?? undefined,
        hasActiveSlot,
        isVoteUpdate,
        isWalletSubmission,
        countedShare,
        isLoading:
            isRoundLoading || isVoteStatusLoading || isVotingPowerLoading,
    };
};
