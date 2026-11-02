import { addressUtils, IconType } from '@aragon/gov-ui-kit';
import { encodeFunctionData, type Hex } from 'viem';
import {
    type IProposalAction,
    type IProposalActionChangeSettings,
    ProposalActionType,
} from '@/modules/governance/api/governanceService';
import type { IActionComposerPluginData } from '@/modules/governance/types';
import type { IDaoPlugin } from '@/shared/api/daoService';
import type { TranslationFunction } from '@/shared/components/translationsProvider';
import { bigIntUtils } from '@/shared/utils/bigIntUtils';
import { daoUtils } from '@/shared/utils/daoUtils';
import { permissionNameUtils } from '@/shared/utils/permissionNameUtils';
import { CrispUpdateSettingsAction } from '../../components/crispActions/crispUpdateSettingsAction';
import {
    CrispProposalActionType,
    type ICrispActionChangeSettings,
    type ICrispPluginSettings,
} from '../../types';
import { crispSettingsUtils } from '../crispSettingsUtils';
import { crispPluginAbi } from '../crispTransactionUtils/crispPluginAbi';
import { defaultUpdateSettings } from './crispActionDefinitions';

const managerPermissionId =
    permissionNameUtils.getPermissionId('MANAGER_PERMISSION');

export interface IGetCrispActionsProps {
    /**
     * DAO plugin data.
     */
    plugin: IDaoPlugin<ICrispPluginSettings>;
    /**
     * The translation function for internationalization.
     */
    t: TranslationFunction;
}

export interface INormalizeCrispChangeSettingsParams {
    /**
     * Action to be normalised.
     */
    action: ICrispActionChangeSettings;
    /**
     * Translation function for internationalization.
     */
    t: TranslationFunction;
    /**
     * Token linked to the plugin.
     */
    token: ICrispPluginSettings['token'];
}

export interface IBuildUpdateSettingsDataParams {
    /**
     * Settings as edited in the proposal form (voting powers in human token units).
     */
    settings: Pick<
        ICrispPluginSettings,
        | 'minParticipation'
        | 'supportThreshold'
        | 'minProposerVotingPower'
        | 'minVoterVotingPower'
        | 'minDuration'
    >;
    /**
     * Decimals of the token the voting powers are expressed in.
     */
    decimals: number;
}

export interface IBuildUpdateSettingsDataResult {
    /**
     * Calldata of the `updateVotingSettings` function.
     */
    data: Hex;
    /**
     * Stringified members of the `VotingSettings` struct.
     */
    parameterValues: string[];
}

export type IGetCrispActionsResult = IActionComposerPluginData<
    IDaoPlugin<ICrispPluginSettings>
>;

class CrispActionUtils {
    getCrispActions = ({
        plugin,
        t,
    }: IGetCrispActionsProps): IGetCrispActionsResult => {
        const { address } = plugin;

        return {
            groups: [
                {
                    id: address,
                    name: daoUtils.getPluginName(plugin),
                    info: addressUtils.truncateAddress(address),
                    indexData: [address],
                },
            ],
            items: [
                {
                    id: `${address}-${CrispProposalActionType.UPDATE_VOTE_SETTINGS}`,
                    name: t(
                        `app.plugins.crisp.crispActions.${CrispProposalActionType.UPDATE_VOTE_SETTINGS}`,
                    ),
                    icon: IconType.SETTINGS,
                    groupId: address,
                    defaultValue: defaultUpdateSettings(plugin),
                    meta: plugin,
                    requiredPermissionId: managerPermissionId,
                },
            ],
            components: {
                [CrispProposalActionType.UPDATE_VOTE_SETTINGS]:
                    CrispUpdateSettingsAction,
            },
        };
    };

    isChangeSettingsAction = (
        action: IProposalAction,
    ): action is ICrispActionChangeSettings =>
        action.type === CrispProposalActionType.UPDATE_VOTE_SETTINGS;

    buildUpdateSettingsData = (
        params: IBuildUpdateSettingsDataParams,
    ): IBuildUpdateSettingsDataResult => {
        const { settings, decimals } = params;

        const votingSettings = {
            minProposerVotingPower: bigIntUtils.parseUnits(
                settings.minProposerVotingPower,
                decimals,
            ),
            minVoterVotingPower: bigIntUtils.parseUnits(
                settings.minVoterVotingPower,
                decimals,
            ),
            minParticipation: Math.round(settings.minParticipation),
            supportThreshold: Math.round(settings.supportThreshold),
            minDuration: BigInt(settings.minDuration),
        };

        const data = encodeFunctionData({
            abi: crispPluginAbi,
            functionName: 'updateVotingSettings',
            args: [votingSettings],
        });

        return {
            data,
            parameterValues: Object.values(votingSettings).map((value) =>
                value.toString(),
            ),
        };
    };

    normalizeChangeSettingsAction = (
        params: INormalizeCrispChangeSettingsParams,
    ): IProposalActionChangeSettings => {
        const { action, t, token } = params;
        const { proposedSettings, existingSettings, ...otherValues } = action;

        const completeExistingSettings = { ...existingSettings, token };
        const completeProposedSettings = {
            ...completeExistingSettings,
            ...proposedSettings,
        };

        return {
            ...otherValues,
            type: ProposalActionType.CHANGE_SETTINGS,
            existingSettings: crispSettingsUtils.parseSettings({
                settings: completeExistingSettings,
                t,
            }),
            proposedSettings: crispSettingsUtils.parseSettings({
                settings: completeProposedSettings,
                t,
            }),
        };
    };
}

export const crispActionUtils = new CrispActionUtils();
