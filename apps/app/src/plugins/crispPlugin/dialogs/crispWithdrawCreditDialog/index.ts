import dynamic from 'next/dynamic';

export const CrispWithdrawCreditDialog = dynamic(() =>
    import('./crispWithdrawCreditDialog').then(
        (mod) => mod.CrispWithdrawCreditDialog,
    ),
);

export type {
    ICrispWithdrawCreditDialogParams,
    ICrispWithdrawCreditDialogProps,
} from './crispWithdrawCreditDialog';
