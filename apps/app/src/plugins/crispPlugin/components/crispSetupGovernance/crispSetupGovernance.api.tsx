import type { IPluginSetupGovernanceParams } from '@/modules/createDao/types';
import type { ITokenSetupGovernanceMembershipSettings } from '@/plugins/tokenPlugin/components/tokenSetupGovernance/tokenSetupGovernance.api';
import type { ICrispPluginSettings } from '../../types';

export interface ICrispSetupGovernanceProps
    extends Omit<IPluginSetupGovernanceParams, 'membershipSettings'> {
    /**
     * Membership settings of the CRISP voting body.
     */
    membershipSettings: ITokenSetupGovernanceMembershipSettings;
}

export interface ICrispSetupGovernanceForm
    extends Pick<
        ICrispPluginSettings,
        | 'minParticipation'
        | 'supportThreshold'
        | 'minProposerVotingPower'
        | 'minVoterVotingPower'
        | 'minDuration'
    > {}
