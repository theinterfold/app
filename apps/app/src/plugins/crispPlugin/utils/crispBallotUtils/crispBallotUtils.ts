import type { InputIdentity } from '@crisp-e3/sdk';
import {
    BaseError,
    ContractFunctionRevertedError,
    decodeAbiParameters,
    type Hex,
    isAddressEqual,
    isHash,
    parseAbiParameters,
    parseEventLogs,
    type TransactionReceipt,
} from 'viem';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { wagmiConfig } from '@/modules/application/constants/wagmi';
import type { Network } from '@/shared/api/daoService';
import { networkDefinitions } from '@/shared/constants/networkDefinitions';
import {
    CrispServiceError,
    crispService,
    type ICrispVoteResponse,
} from '../../api/crispService';
import { crispProgramAbi } from '../../constants/crispProgramAbi';
import { CrispError } from '../../types';

export type CrispCommitmentStep =
    /**
     * The server reports the commitment on-chain. The hash is null when the server did not send it.
     */
    | { action: 'committed'; transactionHash: Hex | null }
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
    error: CrispError;
}

export interface ICrispCommitmentExpectation {
    /**
     * CRISP program that must have recorded the commitment.
     */
    programAddress: Hex;
    /**
     * Round the commitment belongs to.
     */
    e3Id: bigint;
    /**
     * Identity of the ballot the voter built, as read from the proof that was staged.
     */
    identity: InputIdentity;
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

// How long a relayed transaction is awaited for confirmation of the commitment once the server
// reported its hash.
const confirmationTimeout = 180_000;

// Layout `CRISPProgram.publishInput` decodes: the envelope of the SDK (proof, slot, ciphertext
// commitment, ciphertext hash, parent index plus one) followed by the expiry and the signature of
// the data-availability attestation the server adds. It differs from the envelope that the
// `decodeInputIdentity` of the SDK reads, which ends after the ciphertext.
const attestedPayloadAbi = parseAbiParameters(
    'bytes, address, bytes32, bytes32, uint40, uint64, bytes',
);

const revertErrorKeys: Record<string, string> = {
    E3NotAcceptingInputs:
        'app.plugins.crisp.crispSubmitVoteDialog.error.votingNotStarted',
    KeyNotPublished:
        'app.plugins.crisp.crispSubmitVoteDialog.error.keyNotPublished',
    InputCommitmentDeadlinePassed:
        'app.plugins.crisp.crispSubmitVoteDialog.error.deadlinePassed',
    InputDeadlinePassed:
        'app.plugins.crisp.crispSubmitVoteDialog.error.deadlinePassed',
    InputAlreadyCommitted:
        'app.plugins.crisp.crispSubmitVoteDialog.error.alreadySubmitted',
    InputAvailabilityAttestationExpired:
        'app.plugins.crisp.crispSubmitVoteDialog.error.attestationExpired',
    InvalidInputAvailabilityAttestation:
        'app.plugins.crisp.crispSubmitVoteDialog.error.attestationRejected',
    InvalidNoirProof:
        'app.plugins.crisp.crispSubmitVoteDialog.error.proofRejected',
    SlotNotEligible:
        'app.plugins.crisp.crispSubmitVoteDialog.error.slotNotEligible',
    UnknownParentInput:
        'app.plugins.crisp.crispSubmitVoteDialog.error.parentInputChanged',
    InputLimitReached:
        'app.plugins.crisp.crispSubmitVoteDialog.error.inputLimitReached',
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
     * @throws When the server fails the ballot, no longer knows it, rejects reading it or does not
     * process it in time, the last transient read failure standing for the timeout when there is one.
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

            const read = await this.readJob(network, step.jobId);

            if (read.job === null) {
                throw new CrispError(
                    'app.plugins.crisp.crispSubmitVoteDialog.error.ballotGone',
                );
            }

            if (read.job != null && read.job.status !== 'pending_commitment') {
                onView(read.job);
                step = this.decideCommitmentStep(read.job);
            } else if (Date.now() >= deadline) {
                throw (
                    read.error ??
                    new CrispError(
                        'app.plugins.crisp.crispSubmitVoteDialog.error.ballotNotProcessed',
                    )
                );
            } else {
                await new Promise((resolve) =>
                    setTimeout(resolve, pollInterval),
                );
            }
        }

        if (step.action === 'error') {
            throw step.error;
        }

        return step;
    };

    /**
     * Validates a transaction hash reported by the server before it is read from the chain or
     * linked to.
     */
    parseTransactionHash = (value?: string | null): Hex | undefined =>
        value != null && isHash(value) ? value : undefined;

    /**
     * Requires the payload the server attested to carry the same input identity as the ballot the
     * voter built, so the wallet never sends a ballot other than the one reviewed, signed and
     * proved. The proof itself is verified by the program, the identity is what it is bound to.
     *
     * @throws When the payload is malformed or names another input.
     */
    assertAttestedPayload = (params: {
        identity: InputIdentity;
        payload: Hex;
    }): void => {
        const { identity, payload } = params;

        let slotAddress: Hex;
        let encryptedVoteCommitment: Hex;
        let encryptedVoteHash: Hex;
        let parentIndexPlusOne: number;

        try {
            [
                ,
                slotAddress,
                encryptedVoteCommitment,
                encryptedVoteHash,
                parentIndexPlusOne,
            ] = decodeAbiParameters(attestedPayloadAbi, payload);
        } catch (error) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.attestedPayloadMismatch',
                { cause: error },
            );
        }

        if (
            !isAddressEqual(slotAddress, identity.slotAddress) ||
            encryptedVoteCommitment.toLowerCase() !==
                identity.encryptedVoteCommitment.toLowerCase() ||
            encryptedVoteHash.toLowerCase() !==
                identity.encryptedVoteHash.toLowerCase() ||
            parentIndexPlusOne !== identity.parentIndexPlusOne
        ) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.attestedPayloadMismatch',
            );
        }
    };

    /**
     * Requires the receipt to be a success that holds an event of the CRISP program for the round,
     * the slot and the ciphertext commitment of the voter's ballot: `InputCommitted` from the
     * commitment, or `InputPublished` from the publication that follows it. The server reports the
     * publication once it is sent, and `finalizeInput` only publishes an input that the program
     * committed with the same slot and commitment.
     *
     * @throws When the transaction reverted or committed something else.
     */
    assertCommitted = (params: {
        receipt: TransactionReceipt;
        expectation: ICrispCommitmentExpectation;
    }): void => {
        const { receipt, expectation } = params;
        const { programAddress, e3Id, identity } = expectation;

        if (receipt.status !== 'success') {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.transactionReverted',
            );
        }

        const isCommitted = parseEventLogs({
            abi: crispProgramAbi,
            eventName: ['InputCommitted', 'InputPublished'],
            logs: receipt.logs,
        }).some(
            ({ address, args }) =>
                isAddressEqual(address, programAddress) &&
                args.e3Id === e3Id &&
                isAddressEqual(args.slotAddress, identity.slotAddress) &&
                args.encryptedVoteCommitment.toLowerCase() ===
                    identity.encryptedVoteCommitment.toLowerCase(),
        );

        if (!isCommitted) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.commitmentNotFound',
            );
        }
    };

    /**
     * Confirms on-chain that the transaction the server reported committed the ballot of the voter,
     * as the word of the server is not enough to report a ballot as submitted.
     *
     * @throws When the transaction cannot be read in time, reverted or committed something else.
     */
    confirmRelayedCommitment = async (params: {
        network: Network;
        transactionHash: Hex;
        expectation: ICrispCommitmentExpectation;
    }): Promise<void> => {
        const { network, transactionHash, expectation } = params;

        let receipt: TransactionReceipt;

        try {
            receipt = await waitForTransactionReceipt(wagmiConfig, {
                hash: transactionHash,
                chainId: networkDefinitions[network].id,
                timeout: confirmationTimeout,
            });
        } catch (error) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.commitmentUnconfirmed',
                { cause: error },
            );
        }

        this.assertCommitted({ receipt, expectation });
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
                return new CrispError(
                    revertErrorKeys[errorName] ??
                        'app.plugins.crisp.crispSubmitVoteDialog.error.contractRejected',
                    { params: { errorName }, cause: error },
                );
            }

            return new Error(error.shortMessage, { cause: error });
        }

        return error instanceof Error ? error : new Error(String(error));
    };

    // Reads the job of a staged ballot: null when the server does not know it. A transient failure
    // counts as no answer yet and is kept to explain a timeout, any other failure is thrown.
    private readJob = async (
        network: Network,
        jobId: string,
    ): Promise<{ job?: ICrispVoteResponse | null; error?: unknown }> => {
        try {
            return {
                job: await crispService.getVoteAvailability({ network, jobId }),
            };
        } catch (error) {
            if (CrispServiceError.isNotFoundError(error)) {
                return { job: null };
            }

            if (CrispServiceError.isTransientError(error)) {
                return { error };
            }

            throw error;
        }
    };

    // The transaction hash is checked before the payload: a relayed job reports its hash and keeps
    // the payload available, and sending it again would be a second commitment of the same
    // statement, which the program refuses with `InputAlreadyCommitted`.
    private decideCommitmentStep = (
        view: ICrispVoteResponse,
    ): CrispCommitmentStep | IWaitStep | IErrorStep => {
        if (view.status === 'failed_broadcast') {
            return this.buildErrorStep(
                view,
                'app.plugins.crisp.crispSubmitVoteDialog.error.broadcastFailed',
            );
        }

        if (view.tx_hash != null) {
            const transactionHash = this.parseTransactionHash(view.tx_hash);

            return transactionHash != null
                ? { action: 'committed', transactionHash }
                : {
                      action: 'error',
                      error: new CrispError(
                          'app.plugins.crisp.crispSubmitVoteDialog.error.transactionHashInvalid',
                      ),
                  };
        }

        if (view.status === 'pending_commitment') {
            return view.job_id != null
                ? { action: 'wait', jobId: view.job_id }
                : this.buildErrorStep(
                      view,
                      'app.plugins.crisp.crispSubmitVoteDialog.error.noJob',
                  );
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

        return this.buildErrorStep(
            view,
            'app.plugins.crisp.crispSubmitVoteDialog.error.noPayload',
        );
    };

    // The reason the server gave wins over the sentence derived from the state of the job.
    private buildErrorStep = (
        view: ICrispVoteResponse,
        fallbackKey: string,
    ): IErrorStep => ({
        action: 'error',
        error:
            view.message != null
                ? new CrispError(
                      'app.plugins.crisp.crispSubmitVoteDialog.error.serverReason',
                      { params: { reason: view.message } },
                  )
                : new CrispError(fallbackKey),
    });
}

export const crispBallotUtils = new CrispBallotUtils();
