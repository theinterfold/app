import { formatUnits } from 'viem';
import type { IDaoPlugin } from '@/shared/api/daoService';
import { PluginContractName } from '@/shared/api/daoService/domain/enum';
import { bigIntUtils } from '@/shared/utils/bigIntUtils';
import {
    CrispProposalActionType,
    type ICrispActionChangeSettings,
    type ICrispPluginSettings,
} from '../../types';

// Voting powers are edited in human token units, while the plugin settings hold them in raw token units
const toFormSettings = (
    settings: ICrispPluginSettings,
): ICrispActionChangeSettings['proposedSettings'] => ({
    ...settings,
    minProposerVotingPower: formatUnits(
        bigIntUtils.safeParse(settings.minProposerVotingPower),
        settings.token.decimals,
    ),
    minVoterVotingPower: formatUnits(
        bigIntUtils.safeParse(settings.minVoterVotingPower),
        settings.token.decimals,
    ),
});

export const defaultUpdateSettings = ({
    address,
    settings,
}: IDaoPlugin<ICrispPluginSettings>): ICrispActionChangeSettings => ({
    type: CrispProposalActionType.UPDATE_VOTE_SETTINGS,
    from: '',
    to: address,
    data: '',
    value: '0',
    proposedSettings: toFormSettings(settings),
    existingSettings: toFormSettings(settings),
    inputData: {
        function: 'updateVotingSettings',
        contract: PluginContractName.CRISP_VOTING,
        parameters: [
            {
                name: '_votingSettings',
                type: 'tuple',
                notice: 'The new voting settings',
                value: '',
                components: [
                    { name: 'minProposerVotingPower', type: 'uint256' },
                    { name: 'minVoterVotingPower', type: 'uint256' },
                    { name: 'minParticipation', type: 'uint32' },
                    { name: 'supportThreshold', type: 'uint32' },
                    { name: 'minDuration', type: 'uint64' },
                ],
            },
        ],
    },
});
