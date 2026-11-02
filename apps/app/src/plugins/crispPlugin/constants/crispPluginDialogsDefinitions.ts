import type { IDialogComponentDefinitions } from '@/shared/components/dialogProvider';
import { CrispRefundDialog } from '../dialogs/crispRefundDialog';
import { CrispSubmitVoteDialog } from '../dialogs/crispSubmitVoteDialog';
import { CrispWithdrawCreditDialog } from '../dialogs/crispWithdrawCreditDialog';
import { CrispPluginDialogId } from './crispPluginDialogId';

export const crispPluginDialogsDefinitions: Record<
    CrispPluginDialogId,
    IDialogComponentDefinitions
> = {
    [CrispPluginDialogId.SUBMIT_VOTE]: {
        Component: CrispSubmitVoteDialog,
        requiresWallet: true,
    },
    [CrispPluginDialogId.REFUND]: {
        Component: CrispRefundDialog,
        requiresWallet: true,
    },
    [CrispPluginDialogId.WITHDRAW_CREDIT]: {
        Component: CrispWithdrawCreditDialog,
        requiresWallet: true,
    },
};
