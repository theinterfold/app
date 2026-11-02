import { renderHook, waitFor } from '@testing-library/react';
import { ReactQueryWrapper } from '@/shared/testUtils';
import {
    generateCrispPluginSettings,
    generateCrispProposal,
} from '../../testUtils';
import { crispProposalResolverUtils } from '../../utils/crispProposalResolverUtils';
import { useCrispProposal } from './useCrispProposal';

describe('useCrispProposal', () => {
    const fetchChainStateSpy = jest.spyOn(
        crispProposalResolverUtils,
        'fetchChainState',
    );

    const proposal = generateCrispProposal({
        proposalIndex: '1',
        settings: generateCrispPluginSettings({ historicalTotalSupply: '5' }),
    });

    const chainState = {
        proposal: {
            executed: false,
            parameters: {
                numOptions: BigInt(3),
                startDate: BigInt(0),
                endDate: BigInt(0),
                snapshotBlock: BigInt(1000),
                minVotingPower: BigInt(5),
                minParticipation: BigInt(15),
                supportThreshold: BigInt(50),
                creditMode: 0,
            },
            tally: { counts: [BigInt(0), BigInt(0), BigInt(0)] },
            actions: [],
            allowFailureMap: BigInt(0),
            targetConfig: {
                target: '0x0000000000000000000000000000000000000000' as const,
                operation: 0,
            },
            e3Id: BigInt(42),
        },
        liveCounts: [BigInt(3), BigInt(2), BigInt(1)],
        totalVotingPower: BigInt(999),
        divisor: BigInt(10),
    };

    afterEach(() => {
        fetchChainStateSpy.mockReset();
    });

    it('returns the envelope while the on-chain state is loading', () => {
        fetchChainStateSpy.mockReturnValue(new Promise(() => undefined));

        const { result } = renderHook(() => useCrispProposal({ proposal }), {
            wrapper: ReactQueryWrapper,
        });

        expect(result.current.proposal).toEqual(proposal);
        expect(result.current.isLoading).toBeTruthy();
    });

    it('does not read anything for an undefined proposal', () => {
        const { result } = renderHook(
            () => useCrispProposal({ proposal: undefined }),
            { wrapper: ReactQueryWrapper },
        );

        expect(result.current.proposal).toBeUndefined();
        expect(fetchChainStateSpy).not.toHaveBeenCalled();
    });

    it('resolves the round, the thresholds and the live tally from the chain', async () => {
        fetchChainStateSpy.mockResolvedValue(chainState);

        const { result } = renderHook(() => useCrispProposal({ proposal }), {
            wrapper: ReactQueryWrapper,
        });

        await waitFor(() => {
            expect(result.current.proposal?.e3Id).toEqual('42');
        });
        expect(result.current.proposal?.isTallyPublished).toBeTruthy();
        expect(result.current.proposal?.settings.historicalTotalSupply).toEqual(
            '999',
        );
        expect(
            result.current.proposal?.metrics.votesByOption[0].totalVotingPower,
        ).toEqual('30');
    });
});
