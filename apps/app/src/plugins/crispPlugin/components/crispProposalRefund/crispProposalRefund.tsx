'use client';

import { DateFormat, EmptyState, formatterUtils } from '@aragon/gov-ui-kit';
import { formatUnits, type Hex } from 'viem';
import { useDialogContext } from '@/shared/components/dialogProvider';
import { useTranslations } from '@/shared/components/translationsProvider';
import { CrispPluginDialogId } from '../../constants/crispPluginDialogId';
import type { ICrispRefundDialogParams } from '../../dialogs/crispRefundDialog';
import type { ICrispWithdrawCreditDialogParams } from '../../dialogs/crispWithdrawCreditDialog';
import { useCrispFeeCredits } from '../../hooks/useCrispFeeCredits';
import { useCrispRefund } from '../../hooks/useCrispRefund';
import { CrispE3FailureReason, type ICrispProposal } from '../../types';
import { crispProposalUtils } from '../../utils/crispProposalUtils';
import { crispRefundUtils } from '../../utils/crispRefundUtils';

export interface ICrispProposalRefundProps {
    /**
     * Proposal whose round failed.
     */
    proposal: ICrispProposal;
}

/**
 * Explains why the round of a proposal failed and lets the payer of the proposal get the fee back
 * into their credit, and withdraw it.
 */
export const CrispProposalRefund: React.FC<ICrispProposalRefundProps> = (
    props,
) => {
    const { proposal } = props;
    const { network, pluginAddress, proposalIndex, e3Id } = proposal;

    const { t } = useTranslations();
    const { open } = useDialogContext();

    const { state, step, isPayer, refetch } = useCrispRefund({ proposal });
    const { credit, decimals, symbol, refetchCredit } = useCrispFeeCredits({
        pluginAddress,
        network,
    });

    const cause = crispProposalUtils.getFailureCause(
        proposal.failureReason ?? CrispE3FailureReason.NONE,
    );

    // A round that missed its deadline is not marked failed by anyone else until the grace period ends
    const markFailedStart =
        step === 'markFailed' && state != null
            ? crispRefundUtils.getMarkFailedStart(proposal, state)
            : undefined;
    const isAwaitingGrace =
        markFailedStart != null && markFailedStart > Date.now();
    const canRefund = isPayer && step != null && !isAwaitingGrace;

    const refresh = () => {
        void refetch();
        void refetchCredit();
    };

    const handleRefund = () => {
        if (state == null || step == null) {
            return;
        }

        const params: ICrispRefundDialogParams = {
            network,
            pluginAddress: pluginAddress as Hex,
            proposalId: BigInt(proposalIndex),
            e3Id: BigInt(e3Id),
            interfold: state.interfold,
            step,
            onSuccess: refresh,
        };
        open(CrispPluginDialogId.REFUND, { params });
    };

    const handleWithdraw = () => {
        if (credit == null || decimals == null || symbol == null) {
            return;
        }

        const params: ICrispWithdrawCreditDialogParams = {
            network,
            pluginAddress: pluginAddress as Hex,
            amount: credit,
            decimals,
            symbol,
            onSuccess: refresh,
        };
        open(CrispPluginDialogId.WITHDRAW_CREDIT, { params });
    };

    const getRefundKey = () => {
        if (!isPayer) {
            return 'payer';
        }

        if (isAwaitingGrace) {
            return 'graceRunning';
        }

        if (step != null) {
            return 'available';
        }

        return state?.isClaimed ? 'claimed' : 'none';
    };

    const refundText = t(
        `app.plugins.crisp.crispProposalRefund.refund.${getRefundKey()}`,
        isAwaitingGrace
            ? {
                  date: formatterUtils.formatDate(markFailedStart, {
                      format: DateFormat.YEAR_MONTH_DAY_TIME,
                  }),
              }
            : undefined,
    );

    return (
        <EmptyState
            description={`${t(`app.plugins.crisp.crispProposalRefund.cause.${cause}`)} ${refundText}`}
            heading={t('app.plugins.crisp.crispProposalRefund.heading')}
            objectIllustration={{ object: 'ERROR' }}
            primaryButton={
                canRefund
                    ? {
                          label: t(
                              `app.plugins.crisp.crispRefundDialog.${step}.submit`,
                          ),
                          onClick: handleRefund,
                      }
                    : undefined
            }
            secondaryButton={
                isPayer &&
                credit != null &&
                credit > BigInt(0) &&
                decimals != null
                    ? {
                          label: t(
                              'app.plugins.crisp.crispProposalRefund.withdraw',
                              {
                                  amount: formatUnits(credit, decimals),
                                  symbol,
                              },
                          ),
                          onClick: handleWithdraw,
                      }
                    : undefined
            }
        />
    );
};
