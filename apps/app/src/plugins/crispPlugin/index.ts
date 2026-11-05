import { CreateDaoSlotId } from '@/modules/createDao/constants/moduleSlots';
import { GovernanceSlotId } from '@/modules/governance/constants/moduleSlots';
import { SettingsSlotId } from '@/modules/settings/constants/moduleSlots';
import { pluginRegistryUtils } from '@/shared/utils/pluginRegistryUtils';
import { TokenMemberList } from '../tokenPlugin/components/tokenMemberList';
import { TokenMemberPanel } from '../tokenPlugin/components/tokenMemberPanel';
import { useTokenMemberStats } from '../tokenPlugin/hooks/useTokenMemberStats';
import { CrispCreateProposalBodySettings } from './components/crispCreateProposalBodySettings';
import { CrispCreateProposalSettingsForm } from './components/crispCreateProposalSettingsForm';
import { CrispProcessBodyField } from './components/crispProcessBodyField';
import { CrispProposalCreationSettings } from './components/crispProposalCreationSettings';
import { CrispProposalVotingBreakdown } from './components/crispProposalVotingBreakdown';
import { CrispProposalVotingSummary } from './components/crispProposalVotingSummary';
import { CrispSetupGovernance } from './components/crispSetupGovernance';
import { CrispSetupMembership } from './components/crispSetupMembership';
import { CrispSubmitVote } from './components/crispSubmitVote';
import { CrispVoteList } from './components/crispVoteList';
import { crispPlugin } from './constants/crispPlugin';
import { useCrispActions } from './hooks/useCrispActions';
import { useCrispCreateProposalPrerequisiteSteps } from './hooks/useCrispCreateProposalPrerequisiteSteps';
import { useCrispGovernanceSettings } from './hooks/useCrispGovernanceSettings';
import { useCrispNormalizeActions } from './hooks/useCrispNormalizeActions';
import { useCrispPermissionCheckProposalCreation } from './hooks/useCrispPermissionCheckProposalCreation';
import { useCrispPermissionCheckVoteSubmission } from './hooks/useCrispPermissionCheckVoteSubmission';
import { crispBodyUtils } from './utils/crispBodyUtils';
import { crispFeeUtils } from './utils/crispFeeUtils';
import { crispProposalUtils } from './utils/crispProposalUtils';
import { crispTransactionUtils } from './utils/crispTransactionUtils';

export const initialiseCrispPlugin = () => {
    pluginRegistryUtils
        // Plugin definitions
        .registerPlugin(crispPlugin)

        // Governance module slots
        .registerSlotComponent({
            slotId: GovernanceSlotId.GOVERNANCE_DAO_MEMBER_LIST,
            pluginId: crispPlugin.id,
            component: TokenMemberList,
        })
        .registerSlotComponent({
            slotId: GovernanceSlotId.GOVERNANCE_MEMBER_PANEL,
            pluginId: crispPlugin.id,
            component: TokenMemberPanel,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_MEMBER_STATS,
            pluginId: crispPlugin.id,
            function: useTokenMemberStats,
        })
        .registerSlotComponent({
            slotId: GovernanceSlotId.GOVERNANCE_PROPOSAL_VOTING_BREAKDOWN,
            pluginId: crispPlugin.id,
            component: CrispProposalVotingBreakdown,
        })
        .registerSlotComponent({
            slotId: GovernanceSlotId.GOVERNANCE_VOTE_LIST,
            pluginId: crispPlugin.id,
            component: CrispVoteList,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_PROCESS_PROPOSAL_STATUS,
            pluginId: crispPlugin.id,
            function: crispProposalUtils.getProposalStatus,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_PROCESS_PROPOSAL_SUCCEEDED,
            pluginId: crispPlugin.id,
            function: crispProposalUtils.hasSucceeded,
        })
        .registerSlotComponent({
            slotId: GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_SETTINGS_FORM,
            pluginId: crispPlugin.id,
            component: CrispCreateProposalSettingsForm,
        })
        .registerSlotComponent({
            slotId: GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_BODY_SETTINGS,
            pluginId: crispPlugin.id,
            component: CrispCreateProposalBodySettings,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_BUILD_CREATE_PROPOSAL_DATA,
            pluginId: crispPlugin.id,
            function: crispTransactionUtils.buildCreateProposalData,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_BUILD_CREATE_PROPOSAL_PARAMS,
            pluginId: crispPlugin.id,
            function: crispTransactionUtils.buildCreateProposalParams,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_EXECUTE_CHECK_VERSION_SUPPORTED,
            pluginId: crispPlugin.id,
            function: crispProposalUtils.hasExecuteProposalPermissionModifier,
        })
        // Tops up the fee credit of the creator when it does not cover the quote
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_PREREQUISITE_STEPS,
            pluginId: crispPlugin.id,
            function: useCrispCreateProposalPrerequisiteSteps,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_PREREQUISITE_REVERT,
            pluginId: crispPlugin.id,
            function: crispFeeUtils.isInsufficientCreditRevert,
        })
        // GOVERNANCE_BUILD_VOTE_DATA is not registered, ballots are encrypted client-side and
        // submitted through the CRISP server
        .registerSlotComponent({
            slotId: GovernanceSlotId.GOVERNANCE_SUBMIT_VOTE,
            pluginId: crispPlugin.id,
            component: CrispSubmitVote,
        })
        // The tally is only decrypted once the round closes, so the result of the body reaches the
        // SPP stage after the stage's own voting window
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_BODY_VOTES_AFTER_WINDOW,
            pluginId: crispPlugin.id,
            function: () => true,
        })
        // Percentage added to the gas estimate of the creation. Requesting the round's E3 needs
        // slightly more gas than the estimate covers, and a staged process swallows the body's
        // out-of-gas, creating the proposal without its round
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_GAS_HEADROOM,
            pluginId: crispPlugin.id,
            function: () => 25,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_PLUGIN_ACTIONS,
            pluginId: crispPlugin.id,
            function: useCrispActions,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_PLUGIN_NORMALIZE_ACTIONS,
            pluginId: crispPlugin.id,
            function: useCrispNormalizeActions,
        })
        .registerSlotComponent({
            slotId: GovernanceSlotId.GOVERNANCE_PROPOSAL_VOTING_MULTI_BODY_SUMMARY,
            pluginId: crispPlugin.id,
            component: CrispProposalVotingSummary,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_PERMISSION_CHECK_PROPOSAL_CREATION,
            pluginId: crispPlugin.id,
            function: useCrispPermissionCheckProposalCreation,
        })
        .registerSlotFunction({
            slotId: GovernanceSlotId.GOVERNANCE_PERMISSION_CHECK_VOTE_SUBMISSION,
            pluginId: crispPlugin.id,
            function: useCrispPermissionCheckVoteSubmission,
        })

        // Settings module slots
        .registerSlotFunction({
            slotId: SettingsSlotId.SETTINGS_GOVERNANCE_SETTINGS_HOOK,
            pluginId: crispPlugin.id,
            function: useCrispGovernanceSettings,
        })
        .registerSlotFunction({
            slotId: SettingsSlotId.SETTINGS_PLUGIN_TO_FORM_DATA,
            pluginId: crispPlugin.id,
            function: crispBodyUtils.pluginToFormData,
        })

        // Create DAO module slots
        .registerSlotFunction({
            slotId: CreateDaoSlotId.CREATE_DAO_BUILD_PREPARE_PLUGIN_INSTALL_DATA,
            pluginId: crispPlugin.id,
            function: crispTransactionUtils.buildPrepareInstallData,
        })
        .registerSlotFunction({
            slotId: CreateDaoSlotId.CREATE_DAO_BUILD_INSTALLED_PLUGIN_ACTIONS,
            pluginId: crispPlugin.id,
            function: crispTransactionUtils.buildInstalledPluginActions,
        })
        .registerSlotComponent({
            slotId: CreateDaoSlotId.CREATE_DAO_PROCESS_BODY_READ_FIELD,
            pluginId: crispPlugin.id,
            component: CrispProcessBodyField,
        })
        .registerSlotComponent({
            slotId: CreateDaoSlotId.CREATE_DAO_PROPOSAL_CREATION_SETTINGS,
            pluginId: crispPlugin.id,
            component: CrispProposalCreationSettings,
        })
        .registerSlotComponent({
            slotId: CreateDaoSlotId.CREATE_DAO_SETUP_MEMBERSHIP,
            pluginId: crispPlugin.id,
            component: CrispSetupMembership,
        })
        .registerSlotComponent({
            slotId: CreateDaoSlotId.CREATE_DAO_SETUP_GOVERNANCE,
            pluginId: crispPlugin.id,
            component: CrispSetupGovernance,
        });
};
