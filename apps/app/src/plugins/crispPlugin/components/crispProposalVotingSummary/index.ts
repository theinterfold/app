import dynamic from 'next/dynamic';

export const CrispProposalVotingSummary = dynamic(() =>
    import('./crispProposalVotingSummary').then(
        (mod) => mod.CrispProposalVotingSummary,
    ),
);

export type { ICrispProposalVotingSummaryProps } from './crispProposalVotingSummary';
