/**
 * Lite state of an E3 round as returned by the CRISP server (`state/lite`), limited to the fields
 * the app reads. Field names keep the snake_case shape of the server.
 */
export interface ICrispRoundState {
    /**
     * Lifecycle status of the round. Ballots are only accepted while this is `Active`.
     */
    status: string;
    /**
     * BFV public key of the ciphernode committee. Empty until the committee has published it,
     * which is what gates ballot submission.
     */
    committee_public_key: number[];
}
