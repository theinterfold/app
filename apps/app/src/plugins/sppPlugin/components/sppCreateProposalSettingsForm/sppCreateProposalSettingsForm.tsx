'use client';

import { addressUtils } from '@aragon/gov-ui-kit';
import { DateTime } from 'luxon';
import { GovernanceSlotId } from '@/modules/governance/constants/moduleSlots';
import type { IDaoPlugin } from '@/shared/api/daoService';
import { AdvancedDateInput } from '@/shared/components/forms/advancedDateInput';
import { PluginSingleComponent } from '@/shared/components/pluginSingleComponent';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useDaoPlugins } from '@/shared/hooks/useDaoPlugins';
import type { ISppPluginSettings } from '../../types';

export interface ISppCreateProposalSettingsFormProps {
    /**
     * ID of the DAO the process belongs to.
     */
    daoId: string;
    /**
     * Process to create the proposal for.
     */
    plugin: IDaoPlugin<ISppPluginSettings>;
}

export const SppCreateProposalSettingsForm: React.FC<
    ISppCreateProposalSettingsFormProps
> = (props) => {
    const { daoId, plugin } = props;

    const { t } = useTranslations();

    // The bodies of the process, as the publish dialog collects their prerequisite steps
    const bodies = useDaoPlugins({
        daoId,
        includeSubPlugins: true,
        includeLinkedAccounts: true,
    })?.filter((body) =>
        addressUtils.isAddressEqual(body.meta.parentPlugin, plugin.address),
    );

    return (
        <div className="flex flex-col gap-6 md:gap-12">
            <AdvancedDateInput
                field="startTime"
                helpText={t(
                    'app.plugins.spp.sppCreateProposalSettingsForm.startTime.helpText',
                )}
                label={t(
                    'app.plugins.spp.sppCreateProposalSettingsForm.startTime.label',
                )}
                minTime={DateTime.now()}
            />
            {bodies?.map((body) => (
                <PluginSingleComponent
                    daoId={daoId}
                    key={body.meta.address}
                    plugin={body.meta}
                    pluginId={body.id}
                    slotId={
                        GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_BODY_SETTINGS
                    }
                />
            ))}
        </div>
    );
};
