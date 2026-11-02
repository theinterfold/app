'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
    ICreateProposalPrerequisiteStepsParams,
    ICreateProposalPrerequisiteStepsResult,
} from '@/modules/governance/types';
import type { ISppPluginSettings } from '@/plugins/sppPlugin/types';
import type { IDaoPlugin } from '@/shared/api/daoService';
import type { ITransactionDialogActionParams } from '@/shared/components/transactionDialog';
import type { TransactionStatusState } from '@/shared/components/transactionStatus';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useDaoPlugins } from '@/shared/hooks/useDaoPlugins';
import type { ICrispPluginSettings } from '../../types';
import { crispFeeUtils } from '../../utils/crispFeeUtils';
import type { ICreateCrispProposalFormData } from '../../utils/crispTransactionUtils';
import { useCrispFeeCredits } from '../useCrispFeeCredits';

export enum CrispCreateProposalStep {
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

    // The proposal of a staged process is created with the voting window of the stage, so its
    // fee is quoted for it and not for the dates of the form
    const { parentPlugin } = crispPlugin;
    const parentPlugins = useDaoPlugins({
        daoId,
        includeLinkedAccounts: true,
        pluginAddress: parentPlugin,
    });
    const parentStages =
        parentPlugin != null
            ? (
                  parentPlugins?.[0]?.meta as
                      | IDaoPlugin<ISppPluginSettings>
                      | undefined
              )?.settings.stages
            : undefined;

    // Every stage the plugin is a body of
    const stageDurations = useMemo(
        () =>
            (parentStages ?? [])
                .filter((stage) =>
                    stage.plugins.some(
                        (body) =>
                            body.address.toLowerCase() ===
                            crispPlugin.address.toLowerCase(),
                    ),
                )
                .map((stage) => stage.voteDuration),
        [parentStages, crispPlugin.address],
    );

    // A body whose parent has not loaded yet would be quoted as a direct proposal
    const areStagesResolved = parentPlugin == null || parentStages != null;

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

    const { hasSufficientCredit, depositShortfall, isLoading } =
        useCrispFeeCredits({
            pluginAddress: crispPlugin.address,
            network: crispPlugin.settings.token.network,
            quoteCalls,
        });

    // Latched on the first settled read, as depositing would otherwise remove the step from under
    // the running dialog. Undefined while not yet known.
    const [isRequired, setIsRequired] = useState<boolean>();

    useEffect(() => {
        if (isRequired == null && !isLoading && areStagesResolved) {
            setIsRequired(!hasSufficientCredit);
        }
    }, [isRequired, isLoading, areStagesResolved, hasSufficientCredit]);

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

        return [
            {
                id: `${CrispCreateProposalStep.DEPOSIT_FEE}:${pluginAddress}`,
                order: 0,
                meta: {
                    label: t(
                        `app.plugins.crisp.crispCreateProposalPrerequisiteSteps.step.${CrispCreateProposalStep.DEPOSIT_FEE}.label`,
                    ),
                    errorLabel: t(
                        `app.plugins.crisp.crispCreateProposalPrerequisiteSteps.step.${CrispCreateProposalStep.DEPOSIT_FEE}.errorLabel`,
                    ),
                    state,
                    action: handleDeposit,
                    // Not automatic as the step spends funds of the creator
                    auto: false,
                },
            },
        ];
    }, [isRequired, pluginAddress, state, handleDeposit, t]);

    return { steps, isResolved: isRequired != null };
};
