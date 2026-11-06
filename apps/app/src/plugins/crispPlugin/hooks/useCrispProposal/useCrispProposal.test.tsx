import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { GovernanceServiceKey } from '@/modules/governance/api/governanceService';
import { governanceService } from '@/modules/governance/api/governanceService/governanceService';
import * as daoService from '@/shared/api/daoService';
import { PluginInterfaceType } from '@/shared/api/daoService';
import * as useDaoChainModule from '@/shared/hooks/useDaoChain';
import {
    generateDao,
    generateDaoPlugin,
    generateReactQueryResultSuccess,
    ReactQueryWrapper,
} from '@/shared/testUtils';
import { generateCrispProposal } from '../../testUtils';
import { CrispE3FailureReason } from '../../types';
import { crispRefundUtils } from '../../utils/crispRefundUtils';
import { useCrispProposal } from './useCrispProposal';

describe('useCrispProposal', () => {
    const useDaoSpy = jest.spyOn(daoService, 'useDao');
    const useDaoChainSpy = jest.spyOn(useDaoChainModule, 'useDaoChain');
    const fetchFailureConditionSpy = jest.spyOn(
        crispRefundUtils,
        'fetchFailureCondition',
    );
    const getProposalBySlugSpy = jest.spyOn(
        governanceService,
        'getProposalBySlug',
    );

    const pluginAddress = '0x0000000000000000000000000000000000000012';
    const dao = generateDao({
        plugins: [
            generateDaoPlugin({
                address: pluginAddress,
                slug: 'crisp',
                interfaceType: PluginInterfaceType.CRISP,
            }),
        ],
    });
    const proposal = generateCrispProposal({
        pluginAddress,
        incrementalId: 3,
        e3Id: '1',
    });

    const tallied = { ...proposal, isTallyPublished: true };

    const buildWrapper = (client = new QueryClient()) =>
        function Wrapper({ children }: { children?: React.ReactNode }) {
            return (
                <ReactQueryWrapper client={client}>
                    {children}
                </ReactQueryWrapper>
            );
        };

    beforeEach(() => {
        useDaoSpy.mockReturnValue(
            generateReactQueryResultSuccess({ data: dao }),
        );
        useDaoChainSpy.mockReturnValue({
            chainId: 11_155_111,
        } as ReturnType<typeof useDaoChainModule.useDaoChain>);
        fetchFailureConditionSpy.mockResolvedValue(null);
    });

    afterEach(() => {
        jest.useRealTimers();
        getProposalBySlugSpy.mockReset();
        useDaoSpy.mockReset();
        useDaoChainSpy.mockReset();
        fetchFailureConditionSpy.mockReset();
    });

    it('returns the given proposal while the backend has not answered', () => {
        getProposalBySlugSpy.mockReturnValue(new Promise(() => undefined));

        const { result } = renderHook(() => useCrispProposal({ proposal }), {
            wrapper: buildWrapper(),
        });

        expect(result.current.proposal).toEqual(proposal);
        expect(result.current.isLoading).toBeTruthy();
    });

    it('fetches the proposal from the backend by its slug and returns it', async () => {
        const settled = {
            ...proposal,
            isTallyPublished: true,
            votingPowerDivisor: '10',
            metrics: {
                votesByOption: [{ type: 0, totalVotingPower: '30' }],
            },
        };
        getProposalBySlugSpy.mockResolvedValue(settled);

        const { result } = renderHook(() => useCrispProposal({ proposal }), {
            wrapper: buildWrapper(),
        });

        await waitFor(() => {
            expect(result.current.proposal.isTallyPublished).toBeTruthy();
        });
        expect(result.current.proposal.votingPowerDivisor).toEqual('10');
        expect(result.current.proposal.metrics).toEqual(settled.metrics);
        expect(getProposalBySlugSpy).toHaveBeenCalledWith({
            urlParams: { slug: 'CRISP-3' },
            queryParams: {
                daoId: `${proposal.network}-${proposal.daoAddress}`,
            },
        });
    });

    it.each([
        { name: 'executed', settled: { executed: { status: true } } },
        {
            name: 'failed',
            settled: { failureReason: CrispE3FailureReason.DKG_TIMEOUT },
        },
        { name: 'tally-published', settled: { isTallyPublished: true } },
    ])('does not fetch a $name proposal', ({ settled }) => {
        const settledProposal = { ...proposal, ...settled };

        const { result } = renderHook(
            () => useCrispProposal({ proposal: settledProposal }),
            { wrapper: buildWrapper() },
        );

        expect(result.current.proposal).toEqual(settledProposal);
        expect(getProposalBySlugSpy).not.toHaveBeenCalled();
        expect(fetchFailureConditionSpy).not.toHaveBeenCalled();
    });

    it('does not fetch anything for an undefined proposal', () => {
        const { result } = renderHook(
            () => useCrispProposal({ proposal: undefined }),
            { wrapper: buildWrapper() },
        );

        expect(result.current.proposal).toBeUndefined();
        expect(getProposalBySlugSpy).not.toHaveBeenCalled();
        expect(fetchFailureConditionSpy).not.toHaveBeenCalled();
    });

    it('does not fetch while the proposal slug cannot be resolved', () => {
        useDaoSpy.mockReturnValue(
            generateReactQueryResultSuccess({ data: generateDao() }),
        );

        renderHook(() => useCrispProposal({ proposal }), {
            wrapper: buildWrapper(),
        });

        expect(getProposalBySlugSpy).not.toHaveBeenCalled();
    });

    it('polls every 15 seconds until the proposal is settled', async () => {
        jest.useFakeTimers({ advanceTimers: true });
        getProposalBySlugSpy.mockResolvedValue(proposal);

        renderHook(() => useCrispProposal({ proposal }), {
            wrapper: buildWrapper(),
        });
        await waitFor(() => {
            expect(getProposalBySlugSpy).toHaveBeenCalledTimes(1);
        });

        act(() => {
            jest.advanceTimersByTime(15_000);
        });
        await waitFor(() => {
            expect(getProposalBySlugSpy).toHaveBeenCalledTimes(2);
        });

        getProposalBySlugSpy.mockResolvedValue(tallied);
        act(() => {
            jest.advanceTimersByTime(15_000);
        });
        await waitFor(() => {
            expect(getProposalBySlugSpy).toHaveBeenCalledTimes(3);
        });

        // Settling invalidates the indexed proposals, which refetches the polled one a last time
        const maxCallsOnceSettled = 4;
        act(() => {
            jest.advanceTimersByTime(60_000);
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(getProposalBySlugSpy.mock.calls.length).toBeLessThanOrEqual(
            maxCallsOnceSettled,
        );
    });

    it('invalidates the indexed proposals once the polled proposal settles', async () => {
        const client = new QueryClient();
        const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
        getProposalBySlugSpy.mockResolvedValue(tallied);

        renderHook(() => useCrispProposal({ proposal }), {
            wrapper: buildWrapper(client),
        });

        await waitFor(() => {
            expect(invalidateSpy).toHaveBeenCalledWith({
                queryKey: [GovernanceServiceKey.PROPOSAL_BY_SLUG],
            });
        });
    });

    describe('round that missed a deadline', () => {
        const unmarked = {
            ...proposal,
            e3Id: '7',
        };

        it('reports the failure of the coordinator while the backend proposal has none', async () => {
            fetchFailureConditionSpy.mockResolvedValue(
                CrispE3FailureReason.DKG_TIMEOUT,
            );
            getProposalBySlugSpy.mockResolvedValue(unmarked);

            const { result } = renderHook(
                () => useCrispProposal({ proposal: unmarked }),
                { wrapper: buildWrapper() },
            );

            await waitFor(() => {
                expect(result.current.proposal.failureReason).toEqual(
                    CrispE3FailureReason.DKG_TIMEOUT,
                );
            });
            expect(fetchFailureConditionSpy).toHaveBeenCalledWith({
                chainId: 11_155_111,
                pluginAddress,
                e3Id: BigInt(7),
            });
        });

        it('leaves the proposal as served while the round can not be marked as failed', async () => {
            getProposalBySlugSpy.mockResolvedValue(unmarked);

            const { result } = renderHook(
                () => useCrispProposal({ proposal: unmarked }),
                { wrapper: buildWrapper() },
            );

            await waitFor(() => {
                expect(fetchFailureConditionSpy).toHaveBeenCalled();
            });
            expect(result.current.proposal.failureReason).toBeUndefined();
        });

        it('keeps the failure reason of the backend and reads nothing when it has one', () => {
            const failed = {
                ...unmarked,
                failureReason: CrispE3FailureReason.COMPUTE_TIMEOUT,
            };
            fetchFailureConditionSpy.mockResolvedValue(
                CrispE3FailureReason.DKG_TIMEOUT,
            );

            const { result } = renderHook(
                () => useCrispProposal({ proposal: failed }),
                { wrapper: buildWrapper() },
            );

            expect(result.current.proposal.failureReason).toEqual(
                CrispE3FailureReason.COMPUTE_TIMEOUT,
            );
            expect(fetchFailureConditionSpy).not.toHaveBeenCalled();
        });

        it('prefers the failure reason the backend serves over the one of the coordinator', async () => {
            const failed = {
                ...unmarked,
                failureReason: CrispE3FailureReason.COMPUTE_TIMEOUT,
            };
            fetchFailureConditionSpy.mockResolvedValue(
                CrispE3FailureReason.DKG_TIMEOUT,
            );
            getProposalBySlugSpy.mockResolvedValue(failed);

            const { result } = renderHook(
                () => useCrispProposal({ proposal: unmarked }),
                { wrapper: buildWrapper() },
            );

            await waitFor(() => {
                expect(result.current.proposal.failureReason).toEqual(
                    CrispE3FailureReason.COMPUTE_TIMEOUT,
                );
            });
        });

        it('polls the coordinator every 15 seconds until the round can be marked', async () => {
            jest.useFakeTimers({ advanceTimers: true });
            getProposalBySlugSpy.mockResolvedValue(unmarked);

            renderHook(() => useCrispProposal({ proposal: unmarked }), {
                wrapper: buildWrapper(),
            });
            await waitFor(() => {
                expect(fetchFailureConditionSpy).toHaveBeenCalledTimes(1);
            });

            fetchFailureConditionSpy.mockResolvedValue(
                CrispE3FailureReason.DKG_TIMEOUT,
            );
            act(() => {
                jest.advanceTimersByTime(15_000);
            });
            await waitFor(() => {
                expect(fetchFailureConditionSpy).toHaveBeenCalledTimes(2);
            });

            act(() => {
                jest.advanceTimersByTime(60_000);
            });
            await act(async () => {
                await Promise.resolve();
            });

            expect(fetchFailureConditionSpy).toHaveBeenCalledTimes(2);
        });
    });
});
