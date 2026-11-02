import type { Network } from '@/shared/api/daoService';

export interface ICrispRoundParams {
    /**
     * Network the round is running on, used to resolve the CRISP server of the round.
     */
    network: Network;
    /**
     * Identifier of the E3 round as a decimal string, as E3 ids are around 1e76 and would lose
     * precision as a JS number.
     */
    e3Id: string;
}

export interface ICrispVoteStatusParams extends ICrispRoundParams {
    /**
     * Address of the voting slot to fetch the activity for.
     */
    address: string;
}

export interface ICrispBroadcastBallotParams extends ICrispRoundParams {
    /**
     * Solidity-encoded ballot envelope produced by the CRISP SDK, which already names the slot.
     */
    encodedProof: string;
    /**
     * Asks the server to hand the attested payload back for the voter's wallet to send instead
     * of relaying the ballot itself.
     */
    sendFromWallet: boolean;
}

export interface ICrispVoteAvailabilityParams {
    /**
     * Network the round is running on, used to resolve the CRISP server of the round.
     */
    network: Network;
    /**
     * Identifier of the staged ballot, as returned by the broadcast request.
     */
    jobId: string;
}
