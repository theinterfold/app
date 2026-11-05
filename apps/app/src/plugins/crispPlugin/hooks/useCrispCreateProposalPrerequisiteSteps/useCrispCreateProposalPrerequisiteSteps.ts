'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
    ICreateProposalPrerequisiteStepsParams,
    ICreateProposalPrerequisiteStepsResult,
} from '@/modules/governance/types';
import type { IDaoPlugin } from '@/shared/api/daoService';
import type { ITransactionDialogActionParams } from '@/shared/components/transactionDialog';
import type { TransactionStatusState } from '@/shared/components/transactionStatus';
import { useTranslations } from '@/shared/components/translationsProvider';
import type { ICrispPluginSettings } from '../../types';
import { crispFeeUtils } from '../../utils/crispFeeUtils';
import type { ICreateCrispProposalFormData } from '../../utils/crispTransactionUtils';
import { useCrispFeeCredits } from '../useCrispFeeCredits';
import { useCrispStageDurations } from '../useCrispStageDurations';

enum CrispCreateProposalStep {
    DEPOSIT_FEE = 'DEPOSIT_FEE',
}

/**
 * Contributes a step to the publish dialog to top up the fee credit of the creator, as
 * `createProposal` reverts when the credit does not cover the E3 fee. No step is contributed when
 * the credit already covers it as the dialog opens. One step is contributed per plugin, as a body
 * of multiple stages creates one proposal per stage out of the same credit. Fails closed: a read
 * that failed counts as an insufficient credit.
 */
export const useCrispCreateProposalPrerequisiteSteps = (
    params: ICreateProposalPrerequisiteStepsParams,
): ICreateProposalPrerequisiteStepsResult => {
    const { daoId, plugin, proposal, onSuccess } = params;

    const { t } = useTranslations();
    const [state, setState] = useState<TransactionStatusState>('idle');

    const crispPlugin = plugin as IDaoPlugin<ICrispPluginSettings>;
    const proposalForm = proposal as ICreateCrispProposalFormData;

    const { stageDurations, areStagesResolved } = useCrispStageDurations({
        daoId,
        plugin: crispPlugin,
    });

    // Read once to keep the quote calls stable
    const [now] = useState(() => Math.floor(Date.now() / 1000));

    const quoteCalls = useMemo(
        () =>
            crispFeeUtils.getQuoteCalls({
                proposal: proposalForm,
                stageDurations,
                now,
            }),
        [proposalForm, stageDurations, now],
    );

    const {
        hasSufficientCredit,
        depositAmount,
        decimals,
        symbol,
        depositShortfall,
        depositFailure,
        isLoading,
    } = useCrispFeeCredits({
        pluginAddress: crispPlugin.address,
        network: crispPlugin.settings.token.network,
        quoteCalls,
    });

    // Latched on the first settled read, as depositing would otherwise remove the step from under
    // the running dialog. Undefined while not yet known. The amount is latched with it so the step
    // keeps telling what it deposits once the credit covers the quote.
    const [isRequired, setIsRequired] = useState<boolean>();
    const [amountLabel, setAmountLabel] = useState<string>();

    useEffect(() => {
        if (isRequired == null && !isLoading && areStagesResolved) {
            setIsRequired(!hasSufficientCredit);
            if (depositAmount != null && decimals != null) {
                setAmountLabel(
                    crispFeeUtils.formatAmount(depositAmount, decimals, symbol),
                );
            }
        }
    }, [
        isRequired,
        isLoading,
        areStagesResolved,
        hasSufficientCredit,
        depositAmount,
        decimals,
        symbol,
    ]);

    const handleDeposit = useCallback(
        async ({ onError }: ITransactionDialogActionParams) => {
            setState('pending');

            const deposited = await depositShortfall();

            if (!deposited) {
                setState('error');
                onError(
                    new Error(
                        'useCrispCreateProposalPrerequisiteSteps: fee credit deposit failed',
                    ),
                );

                return;
            }

            setState('success');
            onSuccess();
        },
        [depositShortfall, onSuccess],
    );

    const pluginAddress = crispPlugin.address.toLowerCase();

    const steps = useMemo(() => {
        if (!isRequired) {
            return [];
        }

        const stepKey = `app.plugins.crisp.crispCreateProposalPrerequisiteSteps.step.${CrispCreateProposalStep.DEPOSIT_FEE}`;

        return [
            {
                id: `${CrispCreateProposalStep.DEPOSIT_FEE}:${pluginAddress}`,
                order: 0,
                meta: {
                    label:
                        amountLabel == null
                            ? t(`${stepKey}.labelUnknownAmount`)
                            : t(`${stepKey}.label`, { amount: amountLabel }),
                    errorLabel: t(
                        `${stepKey}.errorLabel.${depositFailure ?? 'transaction'}`,
                        { symbol },
                    ),
                    state,
                    action: handleDeposit,
                    // Not automatic as the step spends funds of the creator
                    auto: false,
                },
            },
        ];
    }, [
        isRequired,
        pluginAddress,
        amountLabel,
        depositFailure,
        symbol,
        state,
        handleDeposit,
        t,
    ]);

    return { steps, isResolved: isRequired != null };
};
