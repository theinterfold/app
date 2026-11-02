import { parseUnits } from 'viem';
import { mockTranslations } from '@/test/utils';
import { generateCrispPluginSettings } from '../../testUtils';
import { crispSettingsUtils } from './crispSettingsUtils';

describe('crispSettings utils', () => {
    describe('parseSettings', () => {
        const parse = (
            settings: Parameters<typeof generateCrispPluginSettings>[0],
        ) =>
            crispSettingsUtils.parseSettings({
                settings: generateCrispPluginSettings(settings),
                t: mockTranslations.tMock,
            });
        const definitionOf = (result: ReturnType<typeof parse>, term: RegExp) =>
            result.find((item) => term.test(item.term))?.definition;

        it('displays the support threshold as a whole percentage', () => {
            const result = parse({ supportThreshold: 66 });

            expect(definitionOf(result, /approvalThreshold/)).toMatch(
                /threshold=66/,
            );
        });

        it('displays the minimum voting power required to vote', () => {
            const { token } = generateCrispPluginSettings();
            const result = parse({
                token,
                minVoterVotingPower: parseUnits('5', token.decimals).toString(),
            });

            expect(definitionOf(result, /voteThreshold/)).toMatch(/balance=5/);
        });

        it('displays the minimum duration', () => {
            const result = parse({ minDuration: 90_000 });

            expect(definitionOf(result, /minimumDuration/)).toMatch(
                /days=1,hours=1,minutes=0/,
            );
        });
    });
});
