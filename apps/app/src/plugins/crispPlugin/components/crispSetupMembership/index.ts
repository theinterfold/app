import dynamic from 'next/dynamic';

export const CrispSetupMembership = dynamic(() =>
    import('./crispSetupMembership').then((mod) => mod.CrispSetupMembership),
);
