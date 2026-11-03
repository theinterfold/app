import dynamic from 'next/dynamic';

export const CrispSubmitVote = dynamic(() =>
    import('./crispSubmitVote').then((mod) => mod.CrispSubmitVote),
);

export type { ICrispSubmitVoteProps } from './crispSubmitVote';
