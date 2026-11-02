import { encodeAbiParameters, encodeFunctionData, type Hex } from 'viem';
import type { IBuildPreparePluginInstallDataParams } from '@/modules/createDao/types';
import type { IProposalCreate } from '@/modules/governance/dialogs/publishProposalDialog';
import type { IBuildCreateProposalDataParams } from '@/modules/governance/types';
import type { ICreateProposalEndDateForm } from '@/modules/governance/utils/createProposalUtils';
import type {
    ITokenSetupMembershipForm,
    ITokenSetupMembershipMember,
} from '@/plugins/tokenPlugin/components/tokenSetupMembership';
import { bigIntUtils } from '@/shared/utils/bigIntUtils';
import { dateUtils } from '@/shared/utils/dateUtils';
import { pluginTransactionUtils } from '@/shared/utils/pluginTransactionUtils';
import type { ICrispSetupGovernanceForm } from '../../components/crispSetupGovernance';
import { crispE3Config } from '../../constants/crispE3Config';
import { crispPlugin } from '../../constants/crispPlugin';
import type { ICrispPluginSettings } from '../../types';
import { crispFeeUtils } from '../crispFeeUtils';
import {
    crispPluginAbi,
    crispPluginSetupAbi,
    crispProposalParamsAbi,
} from './crispPluginAbi';

// The end-date form values are set to "partial" because users can also create proposals without the proposal wizard
export interface ICreateCrispProposalFormData
    extends IProposalCreate,
        Partial<ICreateProposalEndDateForm> {}

export interface IPrepareCrispInstallDataParams
    extends IBuildPreparePluginInstallDataParams<
        ICrispSetupGovernanceForm,
        ITokenSetupMembershipMember,
        ITokenSetupMembershipForm
    > {}

class CrispTransactionUtils {
    buildCreateProposalData = (
        params: IBuildCreateProposalDataParams<
            ICreateCrispProposalFormData,
            ICrispPluginSettings
        >,
    ): Hex => {
        const { metadata, actions, proposal } = params;

        // Same dates as the fee quote, as the fee depends on the resulting voting window
        const { startDate, endDate } = crispFeeUtils.resolveProposalDates({
            proposal,
            now: Math.floor(Date.now() / 1000),
        });

        const data = encodeFunctionData({
            abi: crispPluginAbi,
            functionName: 'createProposal',
            args: [
                metadata,
                actions,
                BigInt(startDate),
                BigInt(endDate),
                this.buildCreateProposalParams(),
            ],
        });

        return data;
    };

    // The `_data` of `createProposal` is the allow-failure map (zero requires every action to
    // succeed), empty bytes revert. Also used by staged processes for their CRISP bodies
    buildCreateProposalParams = (): Hex =>
        encodeAbiParameters(crispProposalParamsAbi, [BigInt(0)]);

    buildPrepareInstallData = (params: IPrepareCrispInstallDataParams) => {
        const { body, dao } = params;
        const { token } = body.membership;

        const repositoryAddress = crispPlugin.repositoryAddresses[dao.network];
        const e3Config = crispE3Config[dao.network];

        if (e3Config == null) {
            throw new Error(
                `CrispTransactionUtils: no Interfold deployment configured for network ${dao.network}`,
            );
        }

        const pluginInitParams = {
            dao: dao.address as Hex,
            token: token.address as Hex,
            interfold: e3Config.interfoldAddress,
            committeeSize: e3Config.committeeSize,
            paramSet: e3Config.paramSet,
            crispProgramAddress: e3Config.crispProgramAddress,
            computeProviderParams: e3Config.computeProviderParams,
            votingSettings: this.buildInstallDataVotingSettings(params),
        };

        // A body of a staged process must not hold the EXECUTE permission on the DAO
        const isStagedBody = params.stageVotingPeriod != null;

        const pluginSettingsData = encodeAbiParameters(crispPluginSetupAbi, [
            pluginInitParams,
            token.address as Hex,
            !isStagedBody,
        ]);

        const transactionData =
            pluginTransactionUtils.buildPrepareInstallationData(
                repositoryAddress,
                crispPlugin.installVersion,
                pluginSettingsData,
                dao.address as Hex,
            );

        return transactionData;
    };

    private buildInstallDataVotingSettings = (
        params: IPrepareCrispInstallDataParams,
    ) => {
        const { body, stageVotingPeriod } = params;

        const {
            minParticipation,
            supportThreshold,
            minProposerVotingPower,
            minVoterVotingPower,
            minDuration,
        } = body.governance;
        const { decimals } = body.membership.token;

        const stageVotingPeriodSeconds = stageVotingPeriod
            ? dateUtils.durationToSeconds(stageVotingPeriod)
            : undefined;

        const processedVotingPeriod = stageVotingPeriodSeconds ?? minDuration;

        // Percentages are whole numbers out of 100, not ppm
        return {
            minProposerVotingPower: bigIntUtils.parseUnits(
                minProposerVotingPower,
                decimals,
            ),
            minVoterVotingPower: bigIntUtils.parseUnits(
                minVoterVotingPower,
                decimals,
            ),
            minParticipation: Math.round(minParticipation),
            supportThreshold: Math.round(supportThreshold),
            minDuration: BigInt(processedVotingPeriod),
        };
    };
}

export const crispTransactionUtils = new CrispTransactionUtils();
