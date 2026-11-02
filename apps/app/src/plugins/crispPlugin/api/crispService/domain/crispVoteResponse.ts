/**
 * Stage of a ballot staged with the CRISP server:
 *
 * - `pending_commitment`: staged, waiting for the server to choose who sends the commitment.
 * - `ready_for_commitment`: the attested payload is ready for the voter's wallet to send.
 * - `pending_availability`: the commitment is on-chain, the ciphertext is still being published.
 * - `success`: the commitment is on-chain and the ciphertext is published.
 * - `failed_broadcast`: the server could not commit the ballot.
 */
export type CrispVoteResponseStatus =
    | 'success'
    | 'pending_commitment'
    | 'pending_availability'
    | 'ready_for_commitment'
    | 'failed_broadcast';

/**
 * Staged ballot as returned by the CRISP server when staging it (`voting/broadcast`) or reading
 * its job (`voting/availability/{job_id}`).
 */
export interface ICrispVoteResponse {
    /**
     * Stage of the staged ballot.
     */
    status: CrispVoteResponseStatus;
    /**
     * Hash of the commitment transaction, null while the server has not sent one.
     */
    tx_hash: string | null;
    /**
     * Identifier of the job, used to follow the ballot while it is pending.
     */
    job_id: string | null;
    /**
     * `publishInput` payload attested by the server, set once the ballot is ready for the voter's
     * wallet to send. It must be sent verbatim.
     */
    encoded_proof: string | null;
    /**
     * Human-readable detail of the outcome, mostly set on failure.
     */
    message: string | null;
}
