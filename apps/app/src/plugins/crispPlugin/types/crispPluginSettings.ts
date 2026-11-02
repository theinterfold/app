import type { ITokenPluginSettings } from '@/plugins/tokenPlugin/types';

// Percentages (`minParticipation`, `supportThreshold`) are whole numbers out of 100, not ppm
export interface ICrispPluginSettings
    extends Omit<ITokenPluginSettings, 'votingMode' | 'votingEscrow'> {
    /**
     * Minimum voting power a member needs to hold in order to submit an encrypted ballot.
     */
    minVoterVotingPower: string;
}
