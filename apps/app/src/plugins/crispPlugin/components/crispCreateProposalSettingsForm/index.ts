import dynamic from 'next/dynamic';

export const CrispCreateProposalSettingsForm = dynamic(() =>
    import('./crispCreateProposalSettingsForm').then(
        (mod) => mod.CrispCreateProposalSettingsForm,
    ),
);

export type { ICrispCreateProposalSettingsFormProps } from './crispCreateProposalSettingsForm';
