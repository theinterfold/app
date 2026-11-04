import { GukModulesProvider } from '@aragon/gov-ui-kit';
import { render, screen } from '@testing-library/react';
import { DateTime } from 'luxon';
import * as usePermissionCheckGuardHook from '@/modules/governance/hooks/usePermissionCheckGuard';
import { VoteOption } from '@/plugins/tokenPlugin/types';
import * as dialogProvider from '@/shared/components/dialogProvider';
import * as useDaoPluginsHook from '@/shared/hooks/useDaoPlugins';
import {
    generateDaoPlugin,
    generateDialogContext,
    generateFilterComponentPlugin,
} from '@/shared/testUtils';
import * as useCrispProposalModule from '../../hooks/useCrispProposal';
import * as useCrispRoundModule from '../../hooks/useCrispRound';
import {
    generateCrispPluginSettings,
    generateCrispProposal,
} from '../../testUtils';
import { CrispSubmitVote, type ICrispSubmitVoteProps } from './crispSubmitVote';

jest.mock('@/modules/governance/components/proposalExecutionStatus', () => ({
    ProposalExecutionStatus: () => (
        <div data-testid="proposal-execution-status-mock" />
    ),
}));

describe('<CrispSubmitVote /> component', () => {
    const useDialogContextSpy = jest.spyOn(dialogProvider, 'useDialogContext');
    const useDaoPluginsSpy = jest.spyOn(useDaoPluginsHook, 'useDaoPlugins');
    const usePermissionCheckGuardSpy = jest.spyOn(
        usePermissionCheckGuardHook,
        'usePermissionCheckGuard',
    );
    const useCrispProposalSpy = jest.spyOn(
        useCrispProposalModule,
        'useCrispProposal',
    );
    const useCrispRoundSpy = jest.spyOn(useCrispRoundModule, 'useCrispRound');

    beforeEach(() => {
        useDialogContextSpy.mockReturnValue(generateDialogContext());
        useDaoPluginsSpy.mockReturnValue([
            generateFilterComponentPlugin({ meta: generateDaoPlugin() }),
        ]);
        usePermissionCheckGuardSpy.mockReturnValue({
            check: jest.fn(),
            result: true,
        });
        useCrispProposalSpy.mockImplementation(({ proposal }) => ({
            proposal,
            isLoading: false,
        }));
        useCrispRoundSpy.mockReturnValue({
            isRoundReady: true,
            isLoading: false,
        });
    });

    afterEach(() => {
        useDialogContextSpy.mockReset();
        useDaoPluginsSpy.mockReset();
        usePermissionCheckGuardSpy.mockReset();
        useCrispProposalSpy.mockReset();
        useCrispRoundSpy.mockReset();
    });

    const createTestComponent = (props?: Partial<ICrispSubmitVoteProps>) => {
        const completeProps: ICrispSubmitVoteProps = {
            daoId: 'test-dao-id',
            proposal: generateCrispProposal(),
            ...props,
        };

        return (
            <GukModulesProvider>
                <CrispSubmitVote {...completeProps} />
            </GukModulesProvider>
        );
    };

    // Seconds relative to now
    const at = (offset: number) =>
        Math.round(DateTime.now().toSeconds()) + offset;

    it.each([
        {
            window: 'open',
            startDate: at(-60),
            endDate: at(3600),
            visible: true,
            awaitingStart: false,
        },
        {
            window: 'not yet open',
            startDate: at(60),
            endDate: at(3600),
            visible: true,
            awaitingStart: true,
        },
        {
            window: 'closed',
            startDate: at(-3600),
            endDate: at(-60),
            visible: false,
            awaitingStart: false,
        },
    ])(
        'holds the vote until the ballot window opens and hides it once closed ($window)',
        ({ startDate, endDate, visible, awaitingStart }) => {
            const proposal = generateCrispProposal({ startDate, endDate });
            render(createTestComponent({ proposal }));
            const button = screen.queryByRole('button', {
                name: /crispSubmitVote.buttons.vote/,
            });
            expect(button != null).toBe(visible);
            expect(button?.hasAttribute('disabled') ?? false).toBe(
                awaitingStart,
            );
            expect(
                screen.queryByText(/crispSubmitVote.roundNotStarted/) != null,
            ).toBe(awaitingStart);
        },
    );

    it.each([
        { key: 'not published', isRoundReady: false, awaiting: true },
        { key: 'published', isRoundReady: true, awaiting: false },
    ])(
        'holds the vote while the committee key is $key',
        ({ isRoundReady, awaiting }) => {
            useCrispRoundSpy.mockReturnValue({
                isRoundReady,
                isLoading: false,
            });
            const proposal = generateCrispProposal({
                startDate: at(-60),
                endDate: at(3600),
            });
            render(createTestComponent({ proposal }));

            const button = screen.getByRole('button', {
                name: /crispSubmitVote.buttons.vote/,
            });
            expect(button.hasAttribute('disabled')).toBe(awaiting);
            expect(
                screen.queryByText(/crispSubmitVote.roundNotReady/) != null,
            ).toBe(awaiting);
        },
    );

    it('offers the execution once the closed round passed, which reports the result to an SPP stage', () => {
        const proposal = generateCrispProposal({
            startDate: at(-3600),
            endDate: at(-60),
            hasActions: true,
            isTallyPublished: true,
            votingPowerDivisor: '1',
            settings: generateCrispPluginSettings({
                historicalTotalSupply: '10',
            }),
            metrics: {
                votesByOption: [
                    { type: VoteOption.YES, totalVotingPower: '5' },
                ],
            },
        });
        render(createTestComponent({ proposal }));
        expect(
            screen.getByTestId('proposal-execution-status-mock'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: /crispSubmitVote.buttons.vote/,
            }),
        ).not.toBeInTheDocument();
    });
});
