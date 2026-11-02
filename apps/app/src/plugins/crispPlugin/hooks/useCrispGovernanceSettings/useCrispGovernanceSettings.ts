import type { IDefinitionSetting } from '@aragon/gov-ui-kit';
import type { IUseGovernanceSettingsParams } from '@/modules/settings/types';
import { useTranslations } from '@/shared/components/translationsProvider';
import type { ICrispPluginSettings } from '../../types';
import { crispSettingsUtils } from '../../utils/crispSettingsUtils';

export interface IUseCrispGovernanceSettingsParams
    extends IUseGovernanceSettingsParams<ICrispPluginSettings> {}

export const useCrispGovernanceSettings = (
    params: IUseCrispGovernanceSettingsParams,
): IDefinitionSetting[] => {
    const { settings } = params;

    const { t } = useTranslations();

    return crispSettingsUtils.parseSettings({ settings, t });
};
