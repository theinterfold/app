import dynamic from 'next/dynamic';

export const CrispProposalVotingBreakdown = dynamic(() =>
    import('./crispProposalVotingBreakdown').then(
        (mod) => mod.CrispProposalVotingBreakdown,
    ),
);

export type { ICrispProposalVotingBreakdownProps } from './crispProposalVotingBreakdown';
