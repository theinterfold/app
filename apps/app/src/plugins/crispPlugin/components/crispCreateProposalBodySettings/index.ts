import dynamic from 'next/dynamic';

export const CrispCreateProposalBodySettings = dynamic(() =>
    import('./crispCreateProposalBodySettings').then(
        (mod) => mod.CrispCreateProposalBodySettings,
    ),
);

export type { ICrispCreateProposalBodySettingsProps } from './crispCreateProposalBodySettings';
