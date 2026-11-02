import { BaseError, ContractFunctionRevertedError, type Hex } from 'viem';
import type { Network } from '@/shared/api/daoService';
import {
    CrispServiceError,
    crispService,
    type ICrispVoteResponse,
} from '../../api/crispService';

export type CrispCommitmentStep =
    /**
     * The commitment is on-chain. The hash is null when the server did not send it.
     */
    | { action: 'committed'; transactionHash: string | null }
    /**
     * The voter's wallet sends the attested payload.
     */
    | { action: 'submit'; payload: Hex };

interface IWaitStep {
    action: 'wait';
    jobId: string;
}

interface IErrorStep {
    action: 'error';
    reason: string;
}

export interface IFollowStagedBallotParams {
    /**
     * Network the round is running on.
     */
    network: Network;
    /**
     * Staged ballot as returned by the broadcast request.
     */
    view: ICrispVoteResponse;
    /**
     * Stops following the ballot, for example when the voter left the page.
     */
    isCancelled: () => boolean;
    /**
     * Called with every new view of the staged ballot.
     */
    onView: (view: ICrispVoteResponse) => void;
}

// How often the job is read while the server chooses who sends the commitment, and how long the
// server may take: its worker can take minutes to reach a job when many are waiting.
const pollInterval = 5000;
const waitTimeout = 600_000;

const revertReasons: Record<string, string> = {
    E3NotAcceptingInputs: 'Voting has not started yet.',
    KeyNotPublished: 'The ciphernode committee has not published its key yet.',
    InputCommitmentDeadlinePassed:
        'The deadline for submitting ballots has passed.',
    InputDeadlinePassed: 'The deadline for submitting ballots has passed.',
    InputAlreadyCommitted: 'This ballot was already submitted.',
    InputAvailabilityAttestationExpired:
        'The server attestation of this ballot expired. Submit the ballot again.',
    InvalidInputAvailabilityAttestation:
        'The server attestation of this ballot was rejected. Submit the ballot again.',
    InvalidNoirProof: 'The CRISP contract rejected the proof of this ballot.',
    SlotNotEligible: 'Your address has no voting power in this round.',
    UnknownParentInput:
        'Your earlier ballot changed while this one was prepared. Submit the ballot again.',
    InputLimitReached: 'This round cannot accept any more ballots.',
};

/**
 * Logic of the encrypted ballot flow that does not depend on React or the SDK.
 */
class CrispBallotUtils {
    /**
     * EIP-712 `Ballot` request of the CRISP program, which binds the signature to the round, the
     * slot, the exact ciphertext, the chain and the program. Must match the `EIP712("CRISP", "1")`
     * domain and the `BALLOT_TYPEHASH` of `CRISPProgram`. It has to be signed with
     * `signTypedData`: `signMessage` adds the EIP-191 prefix and signs a different digest.
     */
    buildBallotSignatureRequest = (params: {
        chainId: number;
        crispProgram: Hex;
        e3Id: bigint;
        slot: Hex;
        ciphertextCommitment: Hex;
    }) => {
        const { chainId, crispProgram, e3Id, slot, ciphertextCommitment } =
            params;

        return {
            domain: {
                name: 'CRISP',
                version: '1',
                chainId,
                verifyingContract: crispProgram,
            },
            types: {
                Ballot: [
                    { name: 'e3Id', type: 'uint256' },
                    { name: 'slot', type: 'address' },
                    { name: 'ciphertextCommitment', type: 'bytes32' },
                ],
            },
            primaryType: 'Ballot',
            message: { e3Id, slot, ciphertextCommitment },
        } as const;
    };

    /**
     * Follows a staged ballot until the commitment is on-chain or the server hands the attested
     * payload back for the voter's wallet to send, which happens when the voter asked for it, the
     * relay is off, a relay limit is reached or the relay key cannot pay.
     *
     * @returns The next step, or undefined when cancelled.
     * @throws When the server fails the ballot, no longer knows it or does not process it in time.
     */
    followStagedBallot = async (
        params: IFollowStagedBallotParams,
    ): Promise<CrispCommitmentStep | undefined> => {
        const { network, view, isCancelled, onView } = params;

        const deadline = Date.now() + waitTimeout;
        let step = this.decideCommitmentStep(view);

        while (step.action === 'wait') {
            if (isCancelled()) {
                return;
            }

            const job = await this.readJob(network, step.jobId);

            if (job === null) {
                throw new Error(
                    'The server no longer has this ballot. Submit it again.',
                );
            }

            if (job != null && job.status !== 'pending_commitment') {
                onView(job);
                step = this.decideCommitmentStep(job);
            } else if (Date.now() >= deadline) {
                throw new Error(
                    'The server has not processed this ballot yet. Try again later.',
                );
            } else {
                await new Promise((resolve) =>
                    setTimeout(resolve, pollInterval),
                );
            }
        }

        if (step.action === 'error') {
            throw new Error(step.reason);
        }

        return step;
    };

    /**
     * Turns a thrown error into a message worth showing the voter. viem appends the request
     * arguments to `message`, and the calldata of a ballot is tens of KB of hex, so the short
     * message is used, and a recognised custom error of the CRISP program wins over it.
     */
    describeFailure = (error: unknown): Error => {
        if (error instanceof BaseError) {
            const revert = error.walk(
                (cause) => cause instanceof ContractFunctionRevertedError,
            );
            const errorName =
                revert instanceof ContractFunctionRevertedError
                    ? revert.data?.errorName
                    : undefined;

            if (errorName != null) {
                return new Error(
                    revertReasons[errorName] ??
                        `The CRISP contract rejected the transaction (${errorName}).`,
                    { cause: error },
                );
            }

            return new Error(error.shortMessage, { cause: error });
        }

        return error instanceof Error ? error : new Error(String(error));
    };

    // Reads the job of a staged ballot: null when the server does not know it, undefined when the
    // read failed, which counts as no answer yet.
    private readJob = async (network: Network, jobId: string) => {
        try {
            return await crispService.getVoteAvailability({ network, jobId });
        } catch (error) {
            return CrispServiceError.isNotFoundError(error) ? null : undefined;
        }
    };

    // The transaction hash is checked before the payload: a relayed job reports its hash and keeps
    // the payload available, and sending it again would be a second commitment of the same
    // statement, which the program refuses with `InputAlreadyCommitted`.
    private decideCommitmentStep = (
        view: ICrispVoteResponse,
    ): CrispCommitmentStep | IWaitStep | IErrorStep => {
        if (view.status === 'failed_broadcast') {
            return {
                action: 'error',
                reason:
                    view.message ?? 'The server could not submit this ballot.',
            };
        }

        if (view.tx_hash != null) {
            return { action: 'committed', transactionHash: view.tx_hash };
        }

        if (view.status === 'pending_commitment') {
            return view.job_id != null
                ? { action: 'wait', jobId: view.job_id }
                : {
                      action: 'error',
                      reason:
                          view.message ??
                          'The server did not return a job for this ballot.',
                  };
        }

        if (view.status === 'ready_for_commitment' && view.encoded_proof) {
            return { action: 'submit', payload: view.encoded_proof as Hex };
        }

        // No hash for a commitment the server did not send, for example one the voter's wallet
        // sent earlier.
        if (
            view.status === 'pending_availability' ||
            view.status === 'success'
        ) {
            return { action: 'committed', transactionHash: null };
        }

        return {
            action: 'error',
            reason:
                view.message ??
                'The server has not returned an attested payload for this ballot yet.',
        };
    };
}

export const crispBallotUtils = new CrispBallotUtils();
