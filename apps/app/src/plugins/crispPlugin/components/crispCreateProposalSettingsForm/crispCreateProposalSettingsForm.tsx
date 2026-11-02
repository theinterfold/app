'use client';

import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import type { ICreateProposalEndDateForm } from '@/modules/governance/utils/createProposalUtils';
import type { IDaoPlugin } from '@/shared/api/daoService';
import { AdvancedDateInput } from '@/shared/components/forms/advancedDateInput';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useFormField } from '@/shared/hooks/useFormField';
import { dateUtils } from '@/shared/utils/dateUtils/dateUtils';
import { useCrispFeeCredits } from '../../hooks/useCrispFeeCredits';
import type { ICrispPluginSettings } from '../../types';
import { crispFeeUtils } from '../../utils/crispFeeUtils';
import type { ICreateCrispProposalFormData } from '../../utils/crispTransactionUtils';
import { CrispProposalFeeCredit } from '../crispProposalFeeCredit';

export interface ICrispCreateProposalSettingsFormProps {
    /**
     * Plugin to create the proposal for.
     */
    plugin: IDaoPlugin<ICrispPluginSettings>;
}

// Form field carrying the fee credit check, to block the wizard when the credit is insufficient
interface ICrispFeeCreditForm {
    crispFeeCredit?: boolean;
}

export const CrispCreateProposalSettingsForm: React.FC<
    ICrispCreateProposalSettingsFormProps
> = (props) => {
    const { plugin } = props;

    const { t } = useTranslations();

    const proposalDuration = plugin.settings.minDuration;
    const parsedProposalDuration =
        dateUtils.secondsToDuration(proposalDuration);

    useFormField<ICreateProposalEndDateForm, 'minimumDuration'>(
        'minimumDuration',
        {
            defaultValue: parsedProposalDuration,
        },
    );

    // The fee scales with the voting window, so it is quoted for the dates of the form
    const dateValues = useWatch<ICreateProposalEndDateForm>() as
        | ICreateProposalEndDateForm
        | undefined;

    const minEndTime = dateValues?.startTimeFixed
        ? dateUtils.parseFixedDate(dateValues.startTimeFixed)
        : DateTime.now();

    // A half-entered date quotes the default window instead of throwing
    const quoteCalls = useMemo(() => {
        const fallback = crispFeeUtils.getQuoteCalls({
            proposal: {} as ICreateCrispProposalFormData,
            now: 0,
        });

        if (dateValues == null) {
            return fallback;
        }

        try {
            return crispFeeUtils.getQuoteCalls({
                proposal: dateValues as ICreateCrispProposalFormData,
                now: Math.floor(DateTime.now().toSeconds()),
            });
        } catch {
            return fallback;
        }
    }, [dateValues]);

    const { hasSufficientCredit, isLoading, quoteError } = useCrispFeeCredits({
        pluginAddress: plugin.address,
        network: plugin.settings.token.network,
        quoteCalls,
    });

    useFormField<ICrispFeeCreditForm, 'crispFeeCredit'>('crispFeeCredit', {
        defaultValue: false,
        rules: {
            // A quote that reverts blocks like a known shortfall, as the proposal would revert too
            validate: () => {
                if (isLoading) {
                    return true;
                }

                if (quoteError != null) {
                    return t(
                        'app.plugins.crisp.crispProposalFeeCredit.error.quote',
                    );
                }

                return (
                    hasSufficientCredit ||
                    t('app.plugins.crisp.crispProposalFeeCredit.shortfall')
                );
            },
        },
    });

    return (
        <div className="flex flex-col gap-6 md:gap-12">
            <AdvancedDateInput
                field="startTime"
                label={t(
                    'app.plugins.crisp.crispCreateProposalSettingsForm.startTime.label',
                )}
                minTime={DateTime.now()}
            />
            <AdvancedDateInput
                field="endTime"
                infoText={t(
                    'app.plugins.crisp.crispCreateProposalSettingsForm.endTime.infoText',
                    parsedProposalDuration,
                )}
                label={t(
                    'app.plugins.crisp.crispCreateProposalSettingsForm.endTime.label',
                )}
                minDuration={parsedProposalDuration}
                minTime={minEndTime}
                useDuration={true}
                validateMinDuration={true}
            />
            <CrispProposalFeeCredit plugin={plugin} quoteCalls={quoteCalls} />
        </div>
    );
};
