import { VoteOption } from '@/plugins/tokenPlugin/types';
import {
    generateCrispPluginSettings,
    generateCrispProposal,
} from '../../testUtils';
import { CrispE3FailureReason } from '../../types';
import {
    crispProposalResolverUtils,
    type ICrispOnChainProposal,
} from './crispProposalResolverUtils';

describe('crispProposalResolver utils', () => {
    const buildOnChainProposal = (
        overrides?: Partial<ICrispOnChainProposal>,
    ): ICrispOnChainProposal => ({
        executed: false,
        parameters: {
            numOptions: BigInt(3),
            startDate: BigInt(0),
            endDate: BigInt(0),
            snapshotBlock: BigInt(1000),
            minVotingPower: BigInt(5),
            minParticipation: BigInt(15),
            supportThreshold: BigInt(66),
            creditMode: 0,
        },
        // Stored tally of a proposal that is not executed: zeroes, never a published tally.
        tally: { counts: [BigInt(0), BigInt(0), BigInt(0)] },
        actions: [],
        allowFailureMap: BigInt(0),
        targetConfig: {
            target: '0x0000000000000000000000000000000000000000',
            operation: 0,
        },
        e3Id: BigInt(42),
        ...overrides,
    });

    const proposal = generateCrispProposal({
        proposalIndex: '1',
        settings: generateCrispPluginSettings({ historicalTotalSupply: '1' }),
    });

    const divisor = BigInt(10);

    it('freezes the thresholds, the quorum denominator and the round of the proposal from the chain', () => {
        const result = crispProposalResolverUtils.mergeChainState(proposal, {
            proposal: buildOnChainProposal(),
            totalVotingPower: BigInt(999),
            divisor,
        });

        expect(result.e3Id).toEqual('42');
        expect(result.votingPowerDivisor).toEqual('10');
        expect(result.settings.historicalTotalSupply).toEqual('999');
        expect(result.settings.minParticipation).toEqual(15);
        expect(result.settings.supportThreshold).toEqual(66);
        expect(result.settings.minVoterVotingPower).toEqual('5');
    });

    it('does not read the zeroed stored tally of an open proposal as a published tally', () => {
        const result = crispProposalResolverUtils.mergeChainState(proposal, {
            proposal: buildOnChainProposal(),
            divisor,
        });

        expect(result.isTallyPublished).toBeFalsy();
        expect(result.metrics.votesByOption).toEqual([]);
    });

    it('takes the live tally of a proposal that is not executed, in units of the divisor', () => {
        const result = crispProposalResolverUtils.mergeChainState(proposal, {
            proposal: buildOnChainProposal(),
            liveCounts: [BigInt(30), BigInt(20), BigInt(10)],
            divisor,
        });

        expect(result.isTallyPublished).toBeTruthy();
        expect(result.metrics.votesByOption).toEqual([
            { type: VoteOption.YES, totalVotingPower: '300' },
            { type: VoteOption.NO, totalVotingPower: '200' },
            { type: VoteOption.ABSTAIN, totalVotingPower: '100' },
        ]);
    });

    it('takes the stored tally once executed, even though the live tally is gone', () => {
        const result = crispProposalResolverUtils.mergeChainState(proposal, {
            proposal: buildOnChainProposal({
                executed: true,
                tally: { counts: [BigInt(3), BigInt(2), BigInt(1)] },
            }),
            liveCounts: undefined,
            divisor,
        });

        expect(result.isTallyPublished).toBeTruthy();
        expect(result.executed.status).toBeTruthy();
        expect(result.metrics.votesByOption[0].totalVotingPower).toEqual('30');
    });

    it('prefers the stored tally over a live one once executed', () => {
        const result = crispProposalResolverUtils.mergeChainState(proposal, {
            proposal: buildOnChainProposal({
                executed: true,
                tally: { counts: [BigInt(3), BigInt(2), BigInt(1)] },
            }),
            liveCounts: [BigInt(9), BigInt(9), BigInt(9)],
            divisor,
        });

        expect(result.metrics.votesByOption[0].totalVotingPower).toEqual('30');
    });

    it('keeps the tally unconverted while the divisor of the round is unknown', () => {
        const result = crispProposalResolverUtils.mergeChainState(proposal, {
            proposal: buildOnChainProposal(),
            liveCounts: [BigInt(30), BigInt(20), BigInt(10)],
        });

        expect(result.isTallyPublished).toBeTruthy();
        expect(result.votingPowerDivisor).toBeUndefined();
        expect(result.metrics.votesByOption).toEqual([]);
    });

    it('keeps the indexed total supply when the on-chain read has not landed', () => {
        const withSupply = generateCrispProposal({
            settings: generateCrispPluginSettings({
                historicalTotalSupply: '123',
            }),
        });

        const result = crispProposalResolverUtils.mergeChainState(withSupply, {
            proposal: buildOnChainProposal(),
        });

        expect(result.settings.historicalTotalSupply).toEqual('123');
    });

    it('leaves the envelope untouched for a proposal the plugin does not know', () => {
        const unknown = buildOnChainProposal({
            parameters: {
                ...buildOnChainProposal().parameters,
                snapshotBlock: BigInt(0),
            },
        });

        expect(
            crispProposalResolverUtils.mergeChainState(proposal, {
                proposal: unknown,
            }),
        ).toBe(proposal);
    });

    describe('getFailureReason', () => {
        const failed = 6;
        const keyPublished = 3;

        it('reports the stored reason of a round the coordinator marked as failed', () => {
            expect(
                crispProposalResolverUtils.getFailureReason(
                    failed,
                    CrispE3FailureReason.DKG_TIMEOUT,
                    [false, 0],
                ),
            ).toEqual(CrispE3FailureReason.DKG_TIMEOUT);
        });

        it('reports the reason of a deadline that passed without the round being marked', () => {
            expect(
                crispProposalResolverUtils.getFailureReason(
                    keyPublished,
                    CrispE3FailureReason.NONE,
                    [true, CrispE3FailureReason.COMPUTE_TIMEOUT],
                ),
            ).toEqual(CrispE3FailureReason.COMPUTE_TIMEOUT);
        });

        it('is not a failure while the round is within its deadlines', () => {
            expect(
                crispProposalResolverUtils.getFailureReason(
                    keyPublished,
                    CrispE3FailureReason.NONE,
                    [false, 0],
                ),
            ).toBeUndefined();
        });

        it('is not a failure while the reads are unavailable', () => {
            expect(
                crispProposalResolverUtils.getFailureReason(),
            ).toBeUndefined();
        });
    });

    describe('isSettled', () => {
        it('waits while there is no tally, no failure and no execution', () => {
            expect(
                crispProposalResolverUtils.isSettled({
                    proposal: buildOnChainProposal(),
                }),
            ).toBeFalsy();
        });

        it.each([
            {
                name: 'executed',
                state: { proposal: buildOnChainProposal({ executed: true }) },
            },
            {
                name: 'failed',
                state: {
                    proposal: buildOnChainProposal(),
                    failureReason: CrispE3FailureReason.DKG_TIMEOUT,
                },
            },
            {
                name: 'tallied',
                state: {
                    proposal: buildOnChainProposal(),
                    liveCounts: [BigInt(1), BigInt(0), BigInt(0)],
                },
            },
        ])('is settled once the proposal is $name', ({ state }) => {
            expect(crispProposalResolverUtils.isSettled(state)).toBeTruthy();
        });
    });

    it('carries the failure reason of the round onto the proposal', () => {
        const result = crispProposalResolverUtils.mergeChainState(proposal, {
            proposal: buildOnChainProposal(),
            failureReason: CrispE3FailureReason.COMPUTE_TIMEOUT,
        });

        expect(result.failureReason).toEqual(
            CrispE3FailureReason.COMPUTE_TIMEOUT,
        );
    });
});
