'use client';

import { encodeAbiParameters, encodeFunctionData, type Hex } from 'viem';
import {
    type ICreateProcessFormDataAdvanced,
    ProposalCreationMode,
} from '@/modules/createDao/components/createProcessForm';
import { createProcessFormUtils } from '@/modules/createDao/components/createProcessForm/createProcessFormUtils';
import type { ISetupBodyForm } from '@/modules/createDao/dialogs/setupBodyDialog';
import type { ISetupStageSettingsForm } from '@/modules/createDao/dialogs/setupStageSettingsDialog';
import { BodyType } from '@/modules/createDao/types/enum';
import { GovernanceSlotId } from '@/modules/governance/constants/moduleSlots';
import type { IProposalCreate } from '@/modules/governance/dialogs/publishProposalDialog';
import type {
    IBuildCreateProposalDataParams,
    IBuildCreateProposalParamsParams,
} from '@/modules/governance/types';
import {
    createProposalUtils,
    type ICreateProposalEndDateForm,
} from '@/modules/governance/utils/createProposalUtils';
import type { IGetUninstallHelpersParams } from '@/modules/settings/types';
import type { IDao, IDaoPlugin } from '@/shared/api/daoService';
import { dateUtils } from '@/shared/utils/dateUtils';
import { permissionTransactionUtils } from '@/shared/utils/permissionTransactionUtils';
import { pluginRegistryUtils } from '@/shared/utils/pluginRegistryUtils';
import {
    type IPluginInstallationSetupData,
    pluginTransactionUtils,
} from '@/shared/utils/pluginTransactionUtils';
import type { ITransactionRequest } from '@/shared/utils/transactionUtils';
import { sppPlugin } from '../../constants/sppPlugin';
import { type ISppPluginSettings, SppProposalType } from '../../types';
import { sppPluginAbi, sppPluginSetupAbi } from './sppPluginAbi';

export interface ICreateSppProposalFormData
    extends IProposalCreate,
        ICreateProposalEndDateForm {}

class SppTransactionUtils {
    // When stage expiration is not defined, we set a default max-advance to 100 years
    private defaultMaxAdvance = BigInt(
        dateUtils.durationToSeconds({ days: 36_525, hours: 0, minutes: 0 }),
    );

    // A special address for encoding permissions
    // See https://github.com/aragon/osx/blob/main/packages/contracts/src/core/permission/PermissionManager.sol#L23
    private anyAddress: Hex = '0xffffffffffffffffffffffffffffffffffffffff';

    buildCreateProposalData = (
        params: IBuildCreateProposalDataParams<
            ICreateSppProposalFormData,
            ISppPluginSettings
        >,
    ): Hex => {
        const { metadata, actions, proposal, plugin } = params;

        const startDate = createProposalUtils.parseStartDate(proposal);
        const proposalParams = this.buildProposalParams(plugin, proposal);

        const functionArgs = [
            metadata,
            actions,
            BigInt(0),
            startDate,
            proposalParams,
        ];
        const data = encodeFunctionData({
            abi: sppPluginAbi,
            functionName: 'createProposal',
            args: functionArgs,
        });

        return data;
    };

    // Builds the [stage][body] matrix of custom proposal parameters forwarded to the bodies' own
    // createProposal. Bodies without a registered slot function get empty bytes, and trailing
    // empty entries are dropped.
    private buildProposalParams = (
        plugin: IDaoPlugin<ISppPluginSettings>,
        proposal: IProposalCreate,
    ): Hex[][] => {
        const stagesParams = plugin.settings.stages.map((stage) => {
            const bodiesParams = stage.plugins.map((body): Hex => {
                if (body.interfaceType == null) {
                    return '0x';
                }

                const buildParams = pluginRegistryUtils.getSlotFunction<
                    IBuildCreateProposalParamsParams,
                    Hex
                >({
                    slotId: GovernanceSlotId.GOVERNANCE_BUILD_CREATE_PROPOSAL_PARAMS,
                    pluginId: body.interfaceType,
                });

                return buildParams?.({ body, proposal }) ?? '0x';
            });

            return bodiesParams.slice(
                0,
                bodiesParams.findLastIndex((params) => params !== '0x') + 1,
            );
        });

        const stagesCount =
            stagesParams.findLastIndex((params) => params.length > 0) + 1;

        return stagesCount > 0 ? stagesParams.slice(0, stagesCount) : [[]];
    };

    buildPreparePluginInstallData = (metadataCid: string, dao: IDao) => {
        const { address: daoAddress, network } = dao;

        const repositoryAddress = sppPlugin.repositoryAddresses[network];

        const target = { target: daoAddress as Hex, operation: 0 };
        const pluginSettingsData = encodeAbiParameters(sppPluginSetupAbi, [
            metadataCid as Hex,
            [],
            [],
            target,
        ]);

        const transactionData =
            pluginTransactionUtils.buildPrepareInstallationData(
                repositoryAddress,
                sppPlugin.installVersion,
                pluginSettingsData,
                daoAddress as Hex,
            );

        return transactionData;
    };

    buildPluginsSetupActions = (
        values: ICreateProcessFormDataAdvanced,
        setupData: IPluginInstallationSetupData[],
        dao: IDao,
        safeConditionAddresses: Hex[],
    ): ITransactionRequest[] => {
        const daoAddress = dao.address as Hex;

        // The SPP plugin is the one prepared first, the setupData array contains the data for the SPP plugin as the first element.
        const [sppAddress, ...pluginAddresses] = setupData.map(
            (data) => data.pluginAddress,
        );
        const [sppSetupData, ...pluginSetupData] = setupData;

        const updateStages = this.buildUpdateStagesTransaction(
            values.stages,
            sppAddress,
            pluginAddresses,
        );
        const updateCreateProposalRules = this.buildUpdateRulesTransaction(
            values,
            sppSetupData,
            pluginSetupData,
            safeConditionAddresses,
        );

        const updateNewPluginPermissions = pluginAddresses.map((bodyAddress) =>
            this.buildBodyPermissionActions(
                bodyAddress,
                daoAddress,
                sppAddress,
            ),
        );

        const updateExistingPluginPermissions = values.stages
            .flatMap((stage) => stage.bodies)
            .filter((body) => body.type === BodyType.EXISTING)
            .map((body) =>
                this.buildGrantSppProposalCreationAction(
                    body.address as Hex,
                    daoAddress,
                    sppAddress,
                ),
            );

        return [
            updateStages,
            updateCreateProposalRules,
            ...updateNewPluginPermissions.flat(),
            ...updateExistingPluginPermissions.flat(),
        ].filter((action) => action != null);
    };

    // The SPP setup derives the update from the current helper (the rule condition) it receives in the setup
    // payload and ignores the data field, so the prepare-update data is always empty.
    buildPrepareUpdateData = (): Hex => '0x';

    getUninstallHelpers = (params: IGetUninstallHelpersParams): Hex[] => {
        const { proposalCreationConditionAddress } = params.plugin;

        return [proposalCreationConditionAddress] as Hex[];
    };

    private buildBodyPermissionActions = (
        body: Hex,
        dao: Hex,
        spp: Hex,
    ): ITransactionRequest[] => {
        // No address should be able to create proposals directly on sub-plugins
        const revokePluginCreateProposalAction =
            permissionTransactionUtils.buildRevokePermissionTransaction({
                where: body,
                who: this.anyAddress,
                what: permissionTransactionUtils.permissionIds
                    .createProposalPermission,
                to: dao,
            });

        const grantSppCreateProposalAction =
            this.buildGrantSppProposalCreationAction(body, dao, spp);

        // Sub-plugin should not have execute permission on the DAO, only SPP should have execute permission
        const revokeExecutePermission =
            permissionTransactionUtils.buildRevokePermissionTransaction({
                where: dao,
                who: body,
                what: permissionTransactionUtils.permissionIds
                    .executePermission,
                to: dao,
            });

        return [
            revokePluginCreateProposalAction,
            grantSppCreateProposalAction,
            revokeExecutePermission,
        ];
    };

    private buildGrantSppProposalCreationAction = (
        body: Hex,
        dao: Hex,
        spp: Hex,
    ) => {
        // Allow SPP to create proposals on sub-plugins
        const action =
            permissionTransactionUtils.buildGrantPermissionTransaction({
                where: body,
                who: spp,
                what: permissionTransactionUtils.permissionIds
                    .createProposalPermission,
                to: dao,
            });

        return action;
    };

    private buildUpdateRulesTransaction = (
        values: ICreateProcessFormDataAdvanced,
        sppSetupData: IPluginInstallationSetupData,
        pluginSetupData: IPluginInstallationSetupData[],
        safeConditionAddresses: Hex[],
    ): ITransactionRequest | undefined => {
        const {
            stages,
            proposalCreationMode,
            existingProposalCreationConditions = [],
        } = values;

        const sppRuleConditionContract =
            sppSetupData.preparedSetupData.helpers[0];

        if (proposalCreationMode === ProposalCreationMode.ANY_WALLET) {
            return;
        }

        const bodies = stages.flatMap((stage) => stage.bodies);

        const existingConditionAddresses = bodies
            .filter((body) => body.type === BodyType.EXISTING)
            .filter((body) => body.canCreateProposal)
            .map((body) => body.proposalCreationConditionAddress)
            .filter((address) => address != null);

        const newConditionAddresses = bodies
            .filter((body) => body.type === BodyType.NEW)
            .reduce<string[]>((current, body, index) => {
                // Bodies whose setup returns no helpers have no creation condition to add.
                const conditionAddress: string | undefined =
                    pluginSetupData[index].preparedSetupData.helpers[0];
                return body.canCreateProposal && conditionAddress != null
                    ? [...current, conditionAddress]
                    : current;
            }, []);

        const customConditionAddresses = existingProposalCreationConditions
            .map(({ address }) => address)
            .filter((address) => address != null && address.length > 0);

        const allConditionAddresses = [
            ...existingConditionAddresses,
            ...newConditionAddresses,
            ...safeConditionAddresses,
            ...customConditionAddresses,
        ];

        const seen = new Set<string>();
        const conditionAddresses = allConditionAddresses.filter((address) => {
            const key = address.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });

        const conditionRules = permissionTransactionUtils.buildRuleConditions(
            conditionAddresses,
            [],
        );

        const transactionData = encodeFunctionData({
            abi: sppPluginAbi,
            functionName: 'updateRules',
            args: [conditionRules],
        });

        return {
            to: sppRuleConditionContract,
            data: transactionData,
            value: BigInt(0),
        };
    };

    private buildUpdateStagesTransaction = (
        stages: ICreateProcessFormDataAdvanced['stages'],
        sppAddress: Hex,
        bodyAddresses: Hex[],
    ): ITransactionRequest => {
        const processedBodyAddresses = [...bodyAddresses];
        const processedStages = stages.map((stage) => {
            const { settings, bodies } = stage;

            const stageTiming = this.processStageTiming(settings, bodies);
            const stageApprovals = this.processStageApprovals(settings, bodies);

            const processedBodies = bodies.map((body) => ({
                addr:
                    body.type === BodyType.NEW
                        ? processedBodyAddresses.shift()!
                        : body.address,
                // Approve/veto is a per-body property; a stage may mix both.
                resultType: body.proposalType ?? SppProposalType.APPROVAL,
                tryAdvance: true,
                isManual: body.type === BodyType.EXTERNAL,
            }));

            return {
                bodies: processedBodies,
                ...stageApprovals,
                ...stageTiming,
                cancelable: false,
                editable: false,
            };
        });

        const transactionData = encodeFunctionData({
            abi: sppPluginAbi,
            functionName: 'updateStages',
            args: [processedStages],
        });

        return { to: sppAddress, data: transactionData, value: BigInt(0) };
    };

    private processStageApprovals = (
        settings: ISetupStageSettingsForm,
        bodies: ISetupBodyForm[],
    ) => {
        // Approval and veto thresholds apply independently and only when the
        // stage actually has bodies of the corresponding type. Timelock stages
        // (no bodies) therefore end up with both thresholds set to 0. The
        // shared utility clamps the same way the form displays the thresholds.
        const { approvalThreshold, vetoThreshold } =
            createProcessFormUtils.getEffectiveStageThresholds({
                settings,
                bodies,
            });

        return { approvalThreshold, vetoThreshold };
    };

    private processStageTiming = (
        settings: ISetupStageSettingsForm,
        bodies: ISetupBodyForm[],
    ) => {
        const { votingPeriod, stageExpiration, earlyStageAdvance } = settings;

        const voteDuration = BigInt(dateUtils.durationToSeconds(votingPeriod));
        const processedStageExpiration =
            stageExpiration != null
                ? voteDuration +
                  BigInt(dateUtils.durationToSeconds(stageExpiration))
                : undefined;

        // Early advance is not possible for timelock stages (no bodies) nor for
        // stages with any vetoing body, whose veto window must fully elapse.
        const hasVetoingBody = bodies.some(
            (body) => body.proposalType === SppProposalType.VETO,
        );
        const allowEarlyAdvance =
            bodies.length > 0 && earlyStageAdvance && !hasVetoingBody;
        const minAdvance = allowEarlyAdvance ? BigInt(0) : voteDuration;
        const maxAdvance = processedStageExpiration ?? this.defaultMaxAdvance;

        return { minAdvance, maxAdvance, voteDuration };
    };
}

export const sppTransactionUtils = new SppTransactionUtils();
