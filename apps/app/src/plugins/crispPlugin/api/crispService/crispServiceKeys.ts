import type {
    ICrispRoundParams,
    ICrispVoteStatusParams,
} from './crispService.api';

export enum CrispServiceKey {
    ROUND_STATE = 'ROUND_STATE',
    VOTE_STATUS = 'VOTE_STATUS',
}

export const crispServiceKeys = {
    roundState: (params: ICrispRoundParams) => [
        CrispServiceKey.ROUND_STATE,
        params,
    ],
    voteStatus: (params: ICrispVoteStatusParams) => [
        CrispServiceKey.VOTE_STATUS,
        params,
    ],
};
