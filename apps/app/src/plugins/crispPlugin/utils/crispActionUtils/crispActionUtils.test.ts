import { decodeFunctionData, parseUnits } from 'viem';
import { ProposalActionType } from '@/modules/governance/api/governanceService';
import { generateProposalAction } from '@/modules/governance/testUtils';
import { mockTranslations } from '@/test/utils';
import { generateCrispPluginSettings } from '../../testUtils';
import { CrispProposalActionType } from '../../types';
import { crispPluginAbi } from '../crispTransactionUtils/crispPluginAbi';
import { crispActionUtils } from './crispActionUtils';

describe('crispAction utils', () => {
    describe('buildUpdateSettingsData', () => {
        it('encodes updateVotingSettings with whole percentages and raw voting powers', () => {
            const { data, parameterValues } =
                crispActionUtils.buildUpdateSettingsData({
                    settings: {
                        minProposerVotingPower: '2',
                        minVoterVotingPower: '1.5',
                        minParticipation: 20,
                        supportThreshold: 66,
                        minDuration: 900,
                    },
                    decimals: 6,
                });

            const { functionName, args } = decodeFunctionData({
                abi: crispPluginAbi,
                data,
            });

            expect(functionName).toEqual('updateVotingSettings');
            expect(args).toEqual([
                {
                    minProposerVotingPower: parseUnits('2', 6),
                    minVoterVotingPower: parseUnits('1.5', 6),
                    minParticipation: 20,
                    supportThreshold: 66,
                    minDuration: BigInt(900),
                },
            ]);
            expect(parameterValues).toEqual([
                '2000000',
                '1500000',
                '20',
                '66',
                '900',
            ]);
        });
    });

    describe('isChangeSettingsAction', () => {
        it('only matches the CRISP update settings action', () => {
            const crispAction = generateProposalAction({
                type: CrispProposalActionType.UPDATE_VOTE_SETTINGS,
            });
            const otherAction = generateProposalAction({
                type: 'UpdateTokenVoteSettings',
            });

            expect(crispActionUtils.isChangeSettingsAction(crispAction)).toBe(
                true,
            );
            expect(crispActionUtils.isChangeSettingsAction(otherAction)).toBe(
                false,
            );
        });
    });

    describe('normalizeChangeSettingsAction', () => {
        const { token } = generateCrispPluginSettings();
        const decimals = 6;
        const indexedAction = {
            ...generateProposalAction(),
            type: CrispProposalActionType.UPDATE_VOTE_SETTINGS as const,
            existingSettings: {
                ...generateCrispPluginSettings(),
                minProposerVotingPower: '0',
                minVoterVotingPower: '0',
                minParticipation: 10,
                supportThreshold: 50,
                minDuration: 3600,
            },
            proposedSettings: {
                ...generateCrispPluginSettings(),
                minProposerVotingPower: '0',
                minVoterVotingPower: parseUnits('3', decimals).toString(),
                minParticipation: 25,
                supportThreshold: 66,
                minDuration: 7200,
            },
        };

        const normalize = () =>
            crispActionUtils.normalizeChangeSettingsAction({
                action: indexedAction,
                token: { ...token, decimals },
                t: mockTranslations.tMock,
            });

        it('maps the indexed action to the ui-kit settings diff', () => {
            const result = normalize();

            expect(result.type).toEqual(ProposalActionType.CHANGE_SETTINGS);
            expect(result.to).toEqual(indexedAction.to);
        });

        it('displays the existing and proposed support threshold, voter threshold and duration', () => {
            const { existingSettings, proposedSettings } = normalize();
            const definition = (
                settings: typeof existingSettings,
                term: RegExp,
            ) => settings.find((item) => term.test(item.term))?.definition;

            expect(definition(existingSettings, /approvalThreshold/)).toMatch(
                /threshold=50/,
            );
            expect(definition(proposedSettings, /approvalThreshold/)).toMatch(
                /threshold=66/,
            );
            expect(definition(existingSettings, /voteThreshold/)).toMatch(
                /balance=0/,
            );
            expect(definition(proposedSettings, /voteThreshold/)).toMatch(
                /balance=3/,
            );
            expect(definition(proposedSettings, /minimumDuration/)).toMatch(
                /hours=2/,
            );
        });
    });
});
