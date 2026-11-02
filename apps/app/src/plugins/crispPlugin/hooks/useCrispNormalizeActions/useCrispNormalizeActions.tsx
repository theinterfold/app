'use client';

import { addressUtils } from '@aragon/gov-ui-kit';
import type { INormalizeActionsParams } from '@/modules/governance/types';
import type { IDaoPlugin } from '@/shared/api/daoService';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useDaoPlugins } from '@/shared/hooks/useDaoPlugins';
import type { ICrispPluginSettings } from '../../types';
import { crispActionUtils } from '../../utils/crispActionUtils';

export interface IUseCrispNormalizeActionsParams
    extends INormalizeActionsParams {}

export const useCrispNormalizeActions = (
    params: IUseCrispNormalizeActionsParams,
) => {
    const { actions, daoId } = params;

    const { t } = useTranslations();
    const daoPlugins =
        useDaoPlugins({
            daoId,
            includeSubPlugins: true,
            includeLinkedAccounts: true,
        }) ?? [];

    return actions.map((action) => {
        if (crispActionUtils.isChangeSettingsAction(action)) {
            const plugin = daoPlugins.find(({ meta }) =>
                addressUtils.isAddressEqual(action.to, meta.address),
            );

            // The action may target a plugin that is hidden, uninstalled, or external/unknown.
            // Render the raw action instead of crashing.
            if (plugin == null) {
                return action;
            }

            const { token } = (plugin.meta as IDaoPlugin<ICrispPluginSettings>)
                .settings;

            return crispActionUtils.normalizeChangeSettingsAction({
                action,
                token,
                t,
            });
        }

        return action;
    });
};
