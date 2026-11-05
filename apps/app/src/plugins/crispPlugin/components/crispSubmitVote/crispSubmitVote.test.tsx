import { GukModulesProvider } from '@aragon/gov-ui-kit';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import * as useWalletAccountHook from '@/modules/application/hooks/useWalletAccount';
import * as useWalletConnectedHook from '@/modules/application/hooks/useWalletConnected';
import * as usePermissionCheckGuardHook from '@/modules/governance/hooks/usePermissionCheckGuard';
import { VoteOption } from '@/plugins/tokenPlugin/types';
import * as dialogProvider from '@/shared/components/dialogProvider';
import * as useDaoPluginsHook from '@/shared/hooks/useDaoPlugins';
import {
    generateDaoPlugin,
    generateDialogContext,
    generateFilterComponentPlugin,
} from '@/shared/testUtils';
import { CrispPluginDialogId } from '../../constants/crispPluginDialogId';
import * as useCrispProposalModule from '../../hooks/useCrispProposal';
import * as useCrispRoundModule from '../../hooks/useCrispRound';
import * as useCrispVotingPowerModule from '../../hooks/useCrispVotingPower';
import {
    generateCrispPluginSettings,
    generateCrispProposal,
} from '../../testUtils';
import { CrispMaskTarget } from '../../types';
import { CrispSubmitVote, type ICrispSubmitVoteProps } from './crispSubmitVote';

jest.mock('@/modules/governance/components/proposalExecutionStatus', () => ({
    ProposalExecutionStatus: () => <p>proposalExecutionStatus</p>,
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
    const useCrispVotingPowerSpy = jest.spyOn(
        useCrispVotingPowerModule,
        'useCrispVotingPower',
    );
    const useWalletConnectedSpy = jest.spyOn(
        useWalletConnectedHook,
        'useWalletConnected',
    );
    const useWalletAccountSpy = jest.spyOn(
        useWalletAccountHook,
        'useWalletAccount',
    );

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
        useWalletConnectedSpy.mockReturnValue(true);
        useWalletAccountSpy.mockReturnValue({
            address: '0x1111111111111111111111111111111111111111',
        } as unknown as ReturnType<
            typeof useWalletAccountHook.useWalletAccount
        >);
        useCrispVotingPowerSpy.mockReturnValue({
            votingPower: {
                ballotVotingPower: BigInt(300),
                rawVotingPower: BigInt(3000),
                votingPowerDivisor: BigInt(10),
            },
            isLoading: false,
            refetch: jest.fn(),
        });
    });

    afterEach(() => {
        useDialogContextSpy.mockReset();
        useDaoPluginsSpy.mockReset();
        usePermissionCheckGuardSpy.mockReset();
        useCrispProposalSpy.mockReset();
        useCrispRoundSpy.mockReset();
        useWalletConnectedSpy.mockReset();
        useWalletAccountSpy.mockReset();
        useCrispVotingPowerSpy.mockReset();
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
        expect(screen.getByText('proposalExecutionStatus')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: /crispSubmitVote.buttons.vote/,
            }),
        ).not.toBeInTheDocument();
    });

    describe('mask actions', () => {
        const maskRandomName = /crispSubmitVote.buttons.maskRandom/;
        const maskSelfName = /crispSubmitVote.buttons.maskSelf/;

        const activeProposal = () =>
            generateCrispProposal({
                startDate: at(-60),
                endDate: at(3600),
            });

        it('offers to mask a voter and to mask the own slot next to the vote while the round takes ballots', () => {
            render(createTestComponent({ proposal: activeProposal() }));

            expect(
                screen.getByRole('button', {
                    name: /crispSubmitVote.buttons.vote/,
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: maskRandomName }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: maskSelfName }),
            ).toBeInTheDocument();
            expect(
                screen.getByText(/crispSubmitVote.maskNote/),
            ).toBeInTheDocument();
        });

        it('hides both actions when no wallet is connected', () => {
            useWalletConnectedSpy.mockReturnValue(false);
            useWalletAccountSpy.mockReturnValue({
                address: undefined,
            } as unknown as ReturnType<
                typeof useWalletAccountHook.useWalletAccount
            >);
            useCrispVotingPowerSpy.mockReturnValue({
                votingPower: undefined,
                isLoading: false,
                refetch: jest.fn(),
            });

            render(createTestComponent({ proposal: activeProposal() }));

            expect(
                screen.queryByRole('button', { name: maskRandomName }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: maskSelfName }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(/crispSubmitVote.maskNote/),
            ).not.toBeInTheDocument();
        });

        it.each([
            { reason: 'not yet open', startDate: at(60), endDate: at(3600) },
            { reason: 'closed', startDate: at(-3600), endDate: at(-60) },
        ])(
            'hides both actions while the round is $reason',
            ({ startDate, endDate }) => {
                const proposal = generateCrispProposal({ startDate, endDate });
                render(createTestComponent({ proposal }));

                expect(
                    screen.queryByRole('button', { name: maskRandomName }),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByRole('button', { name: maskSelfName }),
                ).not.toBeInTheDocument();
            },
        );

        it('hides both actions until the committee key is published', () => {
            useCrispRoundSpy.mockReturnValue({
                isRoundReady: false,
                isLoading: false,
            });

            render(createTestComponent({ proposal: activeProposal() }));

            expect(
                screen.queryByRole('button', { name: maskRandomName }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: maskSelfName }),
            ).not.toBeInTheDocument();
        });

        it('offers to mask a voter but not the own slot when the wallet has no voting power', () => {
            useCrispVotingPowerSpy.mockReturnValue({
                votingPower: {
                    ballotVotingPower: BigInt(0),
                    rawVotingPower: BigInt(0),
                    votingPowerDivisor: BigInt(10),
                },
                isLoading: false,
                refetch: jest.fn(),
            });

            render(createTestComponent({ proposal: activeProposal() }));

            expect(
                screen.getByRole('button', { name: maskRandomName }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: maskSelfName }),
            ).not.toBeInTheDocument();
        });

        it.each([
            { name: maskRandomName, maskTarget: CrispMaskTarget.RANDOM },
            { name: maskSelfName, maskTarget: CrispMaskTarget.SELF },
        ])(
            'opens the submit dialog in mask mode for the $maskTarget target',
            async ({ name, maskTarget }) => {
                const open = jest.fn();
                useDialogContextSpy.mockReturnValue(
                    generateDialogContext({ open }),
                );
                const proposal = activeProposal();

                render(createTestComponent({ proposal }));
                await userEvent.click(screen.getByRole('button', { name }));

                expect(open).toHaveBeenCalledWith(
                    CrispPluginDialogId.SUBMIT_VOTE,
                    {
                        params: {
                            proposal,
                            maskTarget,
                            daoId: 'test-dao-id',
                        },
                    },
                );
            },
        );
    });
});
