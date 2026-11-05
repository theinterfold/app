import { addressUtils } from '@aragon/gov-ui-kit';
import { useCallback, useMemo, useState } from 'react';
import type { IDao, IDaoPlugin } from '@/shared/api/daoService';
import type { ITransactionDialogStep } from '@/shared/components/transactionDialog';
import { daoUtils } from '@/shared/utils/daoUtils';
import { pluginRegistryUtils } from '@/shared/utils/pluginRegistryUtils';
import { GovernanceSlotId } from '../../constants/moduleSlots';
import type {
    ICreateProposalPrerequisiteStepsParams,
    ICreateProposalPrerequisiteStepsResult,
} from '../../types';

export interface IUseProposalPrerequisiteStepsParams {
    /**
     * DAO the proposal is created for.
     */
    dao?: IDao;
    /**
     * Plugin the proposal is created on.
     */
    plugin: IDaoPlugin;
}

export interface IPrerequisitePlugin {
    /**
     * Plugin that registers prerequisite steps, either the proposal plugin or one of its bodies.
     */
    plugin: IDaoPlugin;
    /**
     * Hook registered by the plugin for the prerequisite-steps slot.
     */
    usePrerequisiteSteps: (
        params: ICreateProposalPrerequisiteStepsParams,
    ) => ICreateProposalPrerequisiteStepsResult;
}

export interface IUseProposalPrerequisiteStepsResult {
    /**
     * Plugins that register prerequisite steps, each one reports its steps through `onChange`.
     */
    prerequisitePlugins: IPrerequisitePlugin[];
    /**
     * Steps of all the plugins that were reported, in the order of the plugins.
     */
    prerequisiteSteps: ITransactionDialogStep[];
    /**
     * Defines if every plugin has reported its final steps.
     */
    arePrerequisitesResolved: boolean;
    /**
     * Extra gas, in percent of the estimate, that the creation of the proposal needs.
     */
    gasHeadroom: number;
    /**
     * Callback to report the steps of a plugin.
     */
    onChange: (
        pluginAddress: string,
        result: ICreateProposalPrerequisiteStepsResult,
    ) => void;
}

export const useProposalPrerequisiteSteps = (
    params: IUseProposalPrerequisiteStepsParams,
): IUseProposalPrerequisiteStepsResult => {
    const { dao, plugin } = params;

    // Publishing to a staged process creates a proposal on each of its bodies, so the
    // prerequisites and gas needs of the bodies apply as well. Derived from the cached DAO so the
    // list keeps its identity across renders: the transaction dialog re-applies its steps on
    // every new list.
    const proposalPlugins = useMemo(() => {
        const bodies = daoUtils
            .getDaoPlugins(dao, {
                includeSubPlugins: true,
                includeLinkedAccounts: true,
            })
            ?.filter((body) =>
                addressUtils.isAddressEqual(body.parentPlugin, plugin.address),
            );

        return [plugin, ...(bodies ?? [])];
    }, [dao, plugin]);

    const prerequisitePlugins = useMemo(
        () =>
            proposalPlugins.flatMap((item) => {
                const usePrerequisiteSteps =
                    pluginRegistryUtils.getSlotFunction<
                        ICreateProposalPrerequisiteStepsParams,
                        ICreateProposalPrerequisiteStepsResult
                    >({
                        slotId: GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_PREREQUISITE_STEPS,
                        pluginId: item.interfaceType,
                    });

                return usePrerequisiteSteps
                    ? [{ plugin: item, usePrerequisiteSteps }]
                    : [];
            }),
        [proposalPlugins],
    );

    // Extra gas, in percent of the estimate, that the creation needs. A staged process swallows a
    // body that fails to create its proposal, so the estimate can settle on a limit where a costly
    // body runs out of gas and the proposal is created without it.
    const gasHeadroom = useMemo(
        () =>
            Math.max(
                0,
                ...proposalPlugins.map(
                    (item) =>
                        pluginRegistryUtils.getSlotFunction<undefined, number>({
                            slotId: GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_GAS_HEADROOM,
                            pluginId: item.interfaceType,
                        })?.(undefined) ?? 0,
                ),
            ),
        [proposalPlugins],
    );

    const [prerequisites, setPrerequisites] = useState<
        Record<string, ICreateProposalPrerequisiteStepsResult>
    >({});

    const onChange = useCallback(
        (
            pluginAddress: string,
            result: ICreateProposalPrerequisiteStepsResult,
        ) =>
            setPrerequisites((current) => ({
                ...current,
                [pluginAddress]: result,
            })),
        [],
    );

    const prerequisiteSteps = useMemo(
        () =>
            prerequisitePlugins.flatMap(
                ({ plugin: item }) => prerequisites[item.address]?.steps ?? [],
            ),
        [prerequisitePlugins, prerequisites],
    );

    // A plugin that has not reported yet looks like one without prerequisites, so the dialog
    // only starts once every plugin has resolved its steps.
    const arePrerequisitesResolved = prerequisitePlugins.every(
        ({ plugin: item }) => prerequisites[item.address]?.isResolved === true,
    );

    return {
        prerequisitePlugins,
        prerequisiteSteps,
        arePrerequisitesResolved,
        gasHeadroom,
        onChange,
    };
};
