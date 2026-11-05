'use client';

import { useMemo } from 'react';
import type { IDaoPlugin } from '@/shared/api/daoService';
import { useTranslations } from '@/shared/components/translationsProvider';
import { daoUtils } from '@/shared/utils/daoUtils';
import { useCrispStageDurations } from '../../hooks/useCrispStageDurations';
import type { ICrispPluginSettings } from '../../types';
import { crispFeeUtils } from '../../utils/crispFeeUtils';
import type { ICreateCrispProposalFormData } from '../../utils/crispTransactionUtils';
import { CrispProposalFeeCredit } from '../crispProposalFeeCredit';

export interface ICrispCreateProposalBodySettingsProps {
    /**
     * ID of the DAO the process belongs to.
     */
    daoId: string;
    /**
     * CRISP body of the process the proposal is being created on.
     */
    plugin: IDaoPlugin<ICrispPluginSettings>;
}

/**
 * Shows, on the settings step of a staged process, the fee of the proposal the CRISP body creates
 * and the amount the publish dialog deposits first when the credit of the creator falls short.
 */
export const CrispCreateProposalBodySettings: React.FC<
    ICrispCreateProposalBodySettingsProps
> = (props) => {
    const { daoId, plugin } = props;

    const { t } = useTranslations();

    const { stageDurations, areStagesResolved } = useCrispStageDurations({
        daoId,
        plugin,
    });

    // A staged proposal lasts as long as its stage, so the dates of the form do not price it
    const quoteCalls = useMemo(
        () =>
            crispFeeUtils.getQuoteCalls({
                proposal: {} as ICreateCrispProposalFormData,
                stageDurations,
                now: 0,
            }),
        [stageDurations],
    );

    if (!areStagesResolved || stageDurations.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-3">
            <p className="text-base text-neutral-800 leading-tight">
                {t('app.plugins.crisp.crispCreateProposalBodySettings.title', {
                    name: daoUtils.getPluginName(plugin),
                })}
            </p>
            <CrispProposalFeeCredit plugin={plugin} quoteCalls={quoteCalls} />
        </div>
    );
};
