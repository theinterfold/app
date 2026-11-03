import dynamic from 'next/dynamic';

export const CrispSetupGovernance = dynamic(() =>
    import('./crispSetupGovernance').then((mod) => mod.CrispSetupGovernance),
);

export type {
    ICrispSetupGovernanceForm,
    ICrispSetupGovernanceProps,
} from './crispSetupGovernance.api';
