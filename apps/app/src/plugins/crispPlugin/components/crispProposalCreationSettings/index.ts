import dynamic from 'next/dynamic';

export const CrispProposalCreationSettings = dynamic(() =>
    import('./crispProposalCreationSettings').then(
        (mod) => mod.CrispProposalCreationSettings,
    ),
);
