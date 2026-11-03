import dynamic from 'next/dynamic';

export const CrispUpdateSettingsAction = dynamic(() =>
    import('./crispUpdateSettingsAction').then(
        (mod) => mod.CrispUpdateSettingsAction,
    ),
);

export type { ICrispUpdateSettingsActionProps } from './crispUpdateSettingsAction';
