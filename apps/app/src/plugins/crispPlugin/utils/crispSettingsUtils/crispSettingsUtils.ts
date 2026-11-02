import {
    formatterUtils,
    type IDefinitionSetting,
    NumberFormat,
} from '@aragon/gov-ui-kit';
import { formatUnits } from 'viem';
import type { TranslationFunction } from '@/shared/components/translationsProvider';
import { bigIntUtils } from '@/shared/utils/bigIntUtils';
import { dateUtils } from '@/shared/utils/dateUtils';
import type { ICrispPluginSettings } from '../../types';

export interface IParseCrispSettingsParams {
    /**
     * Settings passed into the function either from the DAO or the proposal.
     */
    settings: ICrispPluginSettings;
    /**
     * The translation function for internationalization.
     */
    t: TranslationFunction;
}

class CrispSettingsUtils {
    parseSettings = (
        params: IParseCrispSettingsParams,
    ): IDefinitionSetting[] => {
        const { settings, t } = params;
        const {
            minParticipation,
            supportThreshold,
            minDuration,
            minProposerVotingPower,
            minVoterVotingPower,
            token,
            historicalTotalSupply,
        } = settings;

        const { symbol: tokenSymbol, totalSupply, decimals } = token;
        const processedTotalSupply = historicalTotalSupply ?? totalSupply;

        const formatVotingPower = (votingPower: string) =>
            formatterUtils.formatNumber(
                formatUnits(bigIntUtils.safeParse(votingPower), decimals),
                { format: NumberFormat.TOKEN_AMOUNT_LONG },
            );

        const formattedMinParticipation = formatterUtils.formatNumber(
            minParticipation / 100,
            { format: NumberFormat.PERCENTAGE_LONG },
        );

        const minParticipationToken = Math.round(
            (Number(processedTotalSupply) * minParticipation) / 100,
        );
        const formattedMinParticipationToken = formatterUtils.formatNumber(
            formatUnits(bigIntUtils.safeParse(minParticipationToken), decimals),
            { format: NumberFormat.TOKEN_AMOUNT_SHORT },
        );

        const formattedSupportThreshold = formatterUtils.formatNumber(
            supportThreshold / 100,
            { format: NumberFormat.PERCENTAGE_LONG },
        );

        const duration = dateUtils.secondsToDuration(minDuration);
        const formattedDuration = t(
            'app.plugins.crisp.crispGovernanceSettings.duration',
            {
                days: duration.days,
                hours: duration.hours,
                minutes: duration.minutes,
            },
        );

        return [
            {
                term: t(
                    'app.plugins.crisp.crispGovernanceSettings.ballotPrivacy',
                ),
                definition: t(
                    'app.plugins.crisp.crispGovernanceSettings.encrypted',
                ),
            },
            {
                term: t(
                    'app.plugins.crisp.crispGovernanceSettings.approvalThreshold',
                ),
                definition: t(
                    'app.plugins.crisp.crispGovernanceSettings.threshold',
                    { threshold: formattedSupportThreshold },
                ),
            },
            {
                term: t(
                    'app.plugins.crisp.crispGovernanceSettings.minimumParticipation',
                ),
                definition: t(
                    'app.plugins.crisp.crispGovernanceSettings.participation',
                    {
                        participation: formattedMinParticipation,
                        tokenValue: formattedMinParticipationToken,
                        tokenSymbol,
                    },
                ),
            },
            {
                term: t(
                    'app.plugins.crisp.crispGovernanceSettings.minimumDuration',
                ),
                definition: formattedDuration,
            },
            {
                term: t(
                    'app.plugins.crisp.crispGovernanceSettings.proposalThreshold',
                ),
                definition: t(
                    'app.plugins.crisp.crispGovernanceSettings.votingPowerAccess',
                    {
                        balance: formatVotingPower(minProposerVotingPower),
                        symbol: tokenSymbol,
                    },
                ),
            },
            {
                term: t(
                    'app.plugins.crisp.crispGovernanceSettings.voteThreshold',
                ),
                definition: t(
                    'app.plugins.crisp.crispGovernanceSettings.votingPowerAccess',
                    {
                        balance: formatVotingPower(minVoterVotingPower),
                        symbol: tokenSymbol,
                    },
                ),
            },
        ];
    };
}

export const crispSettingsUtils = new CrispSettingsUtils();
