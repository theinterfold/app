import type { IProposalAction } from '@/modules/governance/api/governanceService';
import type { ICrispPluginSettings } from './crispPluginSettings';
import type { CrispProposalActionType } from './enum';

export interface ICrispActionChangeSettings extends IProposalAction {
    /**
     * The type of the proposal action.
     */
    type: CrispProposalActionType.UPDATE_VOTE_SETTINGS;
    /**
     * The proposed settings to be updated.
     */
    proposedSettings: Omit<ICrispPluginSettings, 'token'>;
    /**
     * The settings of the plugin at proposal creation.
     */
    existingSettings: Omit<ICrispPluginSettings, 'token'>;
}
