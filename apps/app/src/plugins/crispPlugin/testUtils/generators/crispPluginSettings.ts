import { generateTokenPluginSettingsToken } from '@/plugins/tokenPlugin/testUtils';
import { generatePluginSettings } from '@/shared/testUtils';
import type { ICrispPluginSettings } from '../../types';

export const generateCrispPluginSettings = (
    settings?: Partial<ICrispPluginSettings>,
): ICrispPluginSettings => ({
    ...generatePluginSettings(),
    minDuration: 0,
    minParticipation: 0,
    supportThreshold: 50,
    minProposerVotingPower: '0',
    minVoterVotingPower: '0',
    token: generateTokenPluginSettingsToken(),
    ...settings,
});
