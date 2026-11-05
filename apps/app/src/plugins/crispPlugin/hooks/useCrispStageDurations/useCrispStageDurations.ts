'use client';

import { addressUtils } from '@aragon/gov-ui-kit';
import { useMemo } from 'react';
import type { ISppPluginSettings } from '@/plugins/sppPlugin/types';
import type { IDaoPlugin } from '@/shared/api/daoService';
import { useDaoPlugins } from '@/shared/hooks/useDaoPlugins';

export interface IUseCrispStageDurationsParams {
    /**
     * ID of the DAO the plugin belongs to.
     */
    daoId: string;
    /**
     * CRISP plugin, a body of a staged process or installed on its own.
     */
    plugin: IDaoPlugin;
}

export interface IUseCrispStageDurationsResult {
    /**
     * Voting window, in seconds, of every stage the plugin is a body of. Empty for a plugin
     * installed on its own.
     */
    stageDurations: number[];
    /**
     * False while the stages of the parent process are loading. A body quoted before they load
     * would be quoted as a direct proposal.
     */
    areStagesResolved: boolean;
}

/**
 * Returns the voting windows a CRISP body creates its proposals with: a proposal of a staged
 * process lasts as long as its stage, so its fee is quoted for the stage and not for form dates.
 */
export const useCrispStageDurations = (
    params: IUseCrispStageDurationsParams,
): IUseCrispStageDurationsResult => {
    const { daoId, plugin } = params;
    const { parentPlugin } = plugin;

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

    const stageDurations = useMemo(
        () =>
            (parentStages ?? [])
                .filter((stage) =>
                    stage.plugins.some((body) =>
                        addressUtils.isAddressEqual(
                            body.address,
                            plugin.address,
                        ),
                    ),
                )
                .map((stage) => stage.voteDuration),
        [parentStages, plugin.address],
    );

    return {
        stageDurations,
        areStagesResolved: parentPlugin == null || parentStages != null,
    };
};
