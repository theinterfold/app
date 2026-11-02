import dynamic from 'next/dynamic';

export const CrispRefundDialog = dynamic(() =>
    import('./crispRefundDialog').then((mod) => mod.CrispRefundDialog),
);

export type {
    ICrispRefundDialogParams,
    ICrispRefundDialogProps,
} from './crispRefundDialog';
