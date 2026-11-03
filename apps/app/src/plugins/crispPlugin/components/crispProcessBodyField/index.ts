import dynamic from 'next/dynamic';

export const CrispProcessBodyField = dynamic(() =>
    import('./crispProcessBodyField').then((mod) => mod.CrispProcessBodyField),
);

export type { ICrispProcessBodyFieldProps } from './crispProcessBodyField';
