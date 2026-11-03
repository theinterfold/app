import dynamic from 'next/dynamic';

export const CrispVoteList = dynamic(() =>
    import('./crispVoteList').then((mod) => mod.CrispVoteList),
);
