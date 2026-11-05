import type { ICrispPluginSettings } from '../../types';

export interface ICrispSetupGovernanceForm
    extends Pick<
        ICrispPluginSettings,
        | 'minParticipation'
        | 'supportThreshold'
        | 'minProposerVotingPower'
        | 'minVoterVotingPower'
        | 'minDuration'
    > {}
