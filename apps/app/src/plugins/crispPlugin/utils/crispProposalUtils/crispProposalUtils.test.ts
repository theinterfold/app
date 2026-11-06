import { ProposalStatus } from '@aragon/gov-ui-kit';
import { DateTime } from 'luxon';
import { generateTokenPluginSettingsToken } from '@/plugins/tokenPlugin/testUtils';
import { VoteOption } from '@/plugins/tokenPlugin/types';
import {
    generateCrispPluginSettings,
    generateCrispProposal,
} from '../../testUtils';
import { CrispE3FailureReason, CrispE3Stage } from '../../types';
import { crispProposalUtils } from './crispProposalUtils';

describe('crispProposal utils', () => {
    const past = DateTime.now().minus({ days: 1 }).toSeconds();
    const future = DateTime.now().plus({ days: 1 }).toSeconds();

    // A tally in raw token units, as served by the backend.
    const buildVotes = (yes: string, no: string, abstain = '0') => [
        { type: VoteOption.YES, totalVotingPower: yes },
        { type: VoteOption.NO, totalVotingPower: no },
        { type: VoteOption.ABSTAIN, totalVotingPower: abstain },
    ];

    const buildProposal = (params: {
        yes: string;
        no: string;
        abstain?: string;
        minParticipation?: number;
        supportThreshold?: number;
        totalSupply?: string;
        isTallyPublished?: boolean;
        votingPowerDivisor?: string;
        hasActions?: boolean;
        startDate?: number;
        endDate?: number;
        isExecuted?: boolean;
    }) =>
        generateCrispProposal({
            startDate: params.startDate ?? past,
            endDate: params.endDate ?? past,
            hasActions: params.hasActions ?? true,
            isTallyPublished: params.isTallyPublished ?? true,
            votingPowerDivisor:
                'votingPowerDivisor' in params
                    ? params.votingPowerDivisor
                    : '1',
            executed: { status: params.isExecuted ?? false },
            metrics: {
                votesByOption: buildVotes(
                    params.yes,
                    params.no,
                    params.abstain,
                ),
            },
            settings: generateCrispPluginSettings({
                minParticipation: params.minParticipation ?? 0,
                supportThreshold: params.supportThreshold ?? 50,
                historicalTotalSupply: params.totalSupply ?? '100',
                token: generateTokenPluginSettingsToken({ decimals: 0 }),
            }),
        });

    describe('isSupportReached', () => {
        it('passes on a strict majority of yes over no', () => {
            const proposal = buildProposal({ yes: '51', no: '50' });
            expect(crispProposalUtils.isSupportReached(proposal)).toBeTruthy();
        });

        it('rejects a tie at the default threshold, yes must strictly exceed', () => {
            const proposal = buildProposal({ yes: '50', no: '50' });
            expect(crispProposalUtils.isSupportReached(proposal)).toBeFalsy();
        });

        it('does not count abstentions towards support', () => {
            const proposal = buildProposal({
                yes: '10',
                no: '10',
                abstain: '80',
            });
            expect(crispProposalUtils.isSupportReached(proposal)).toBeFalsy();
        });

        it('uses the threshold frozen into the proposal rather than a simple majority', () => {
            // 60 of 100 decisive votes beats a majority but not a 66% threshold.
            const proposal = buildProposal({
                yes: '60',
                no: '40',
                supportThreshold: 66,
            });

            expect(crispProposalUtils.isSupportReached(proposal)).toBeFalsy();
        });
    });

    describe('isMinParticipationReached', () => {
        it('counts abstentions towards turnout', () => {
            // 10 of 100 tokens turned out, all of them abstaining.
            const proposal = buildProposal({
                yes: '0',
                no: '0',
                abstain: '10',
                minParticipation: 10,
            });

            expect(
                crispProposalUtils.isMinParticipationReached(proposal),
            ).toBeTruthy();
        });

        it('is not reached one unit below the requirement', () => {
            const proposal = buildProposal({
                yes: '9',
                no: '0',
                minParticipation: 10,
            });

            expect(
                crispProposalUtils.isMinParticipationReached(proposal),
            ).toBeFalsy();
        });

        it('is not reached when there is no voting power at the snapshot', () => {
            const proposal = buildProposal({
                yes: '10',
                no: '0',
                minParticipation: 10,
                totalSupply: '0',
            });

            expect(
                crispProposalUtils.isMinParticipationReached(proposal),
            ).toBeFalsy();
        });
    });

    describe('isApprovalReached', () => {
        it('requires quorum even when yes beats no', () => {
            // Quorum gates every proposal on-chain.
            const proposal = buildProposal({
                yes: '5',
                no: '0',
                minParticipation: 10,
            });

            expect(crispProposalUtils.isApprovalReached(proposal)).toBeFalsy();
        });

        it('passes when both quorum and support are met', () => {
            const proposal = buildProposal({
                yes: '20',
                no: '5',
                minParticipation: 10,
            });

            expect(crispProposalUtils.isApprovalReached(proposal)).toBeTruthy();
        });
    });

    describe('isTallyResolved', () => {
        it('needs both the published tally and the divisor of the round', () => {
            const resolved = buildProposal({ yes: '1', no: '0' });
            const noDivisor = buildProposal({
                yes: '1',
                no: '0',
                votingPowerDivisor: undefined,
            });
            const zeroDivisor = buildProposal({
                yes: '1',
                no: '0',
                votingPowerDivisor: '0',
            });
            const unpublished = buildProposal({
                yes: '1',
                no: '0',
                isTallyPublished: false,
            });

            expect(crispProposalUtils.isTallyResolved(resolved)).toBeTruthy();
            expect(crispProposalUtils.isTallyResolved(noDivisor)).toBeFalsy();
            expect(crispProposalUtils.isTallyResolved(zeroDivisor)).toBeFalsy();
            expect(crispProposalUtils.isTallyResolved(unpublished)).toBeFalsy();
        });
    });

    describe('isSettled', () => {
        const waiting = {
            yes: '0',
            no: '0',
            isTallyPublished: false,
        };

        it('is not settled while the round awaits its tally', () => {
            expect(
                crispProposalUtils.isSettled(buildProposal(waiting)),
            ).toBeFalsy();
        });

        it('is settled once the tally is published', () => {
            expect(
                crispProposalUtils.isSettled(
                    buildProposal({ ...waiting, isTallyPublished: true }),
                ),
            ).toBeTruthy();
        });

        it('is settled once the round failed', () => {
            const proposal = {
                ...buildProposal(waiting),
                failureReason: CrispE3FailureReason.DKG_TIMEOUT,
            };

            expect(crispProposalUtils.isSettled(proposal)).toBeTruthy();
        });

        it('is settled once the proposal is executed', () => {
            expect(
                crispProposalUtils.isSettled(
                    buildProposal({ ...waiting, isExecuted: true }),
                ),
            ).toBeTruthy();
        });
    });

    describe('getProposalStatus', () => {
        it('reports an open proposal as active, whatever the tally would say', () => {
            const proposal = buildProposal({
                yes: '100',
                no: '0',
                endDate: future,
                isTallyPublished: false,
            });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.ACTIVE,
            );
        });

        it('reports a closed proposal with no published tally as pending, not rejected', () => {
            // The committee has not decrypted the result yet, so the outcome is unknown.
            const proposal = buildProposal({
                yes: '0',
                no: '0',
                isTallyPublished: false,
            });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.PENDING,
            );
        });

        it('reports a closed proposal with a published tally but an unread divisor as pending', () => {
            const proposal = buildProposal({
                yes: '20',
                no: '0',
                votingPowerDivisor: undefined,
            });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.PENDING,
            );
        });

        it('reports an executed proposal as executed even without a published tally', () => {
            const proposal = buildProposal({
                yes: '0',
                no: '0',
                isTallyPublished: false,
                isExecuted: true,
            });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.EXECUTED,
            );
        });

        it('reports a passed proposal with actions as executable', () => {
            const proposal = buildProposal({
                yes: '20',
                no: '5',
                minParticipation: 10,
            });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.EXECUTABLE,
            );
        });

        it('reports a passed proposal without actions as accepted', () => {
            const proposal = buildProposal({
                yes: '20',
                no: '5',
                minParticipation: 10,
                hasActions: false,
            });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.ACCEPTED,
            );
        });

        it('reports a proposal that missed quorum as rejected', () => {
            const proposal = buildProposal({
                yes: '5',
                no: '0',
                minParticipation: 10,
            });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.REJECTED,
            );
        });

        it('reports a published tied tally as rejected', () => {
            const proposal = buildProposal({ yes: '50', no: '50' });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.REJECTED,
            );
        });
    });

    describe('hasSucceeded', () => {
        it('is false while the proposal is still open', () => {
            const proposal = buildProposal({
                yes: '20',
                no: '0',
                minParticipation: 10,
                endDate: future,
            });

            expect(crispProposalUtils.hasSucceeded(proposal)).toBeFalsy();
        });

        it('is false when the tally has not been published', () => {
            const proposal = buildProposal({
                yes: '20',
                no: '0',
                minParticipation: 10,
                isTallyPublished: false,
            });

            expect(crispProposalUtils.hasSucceeded(proposal)).toBeFalsy();
        });

        it('is true for a closed proposal with a passing published tally', () => {
            const proposal = buildProposal({
                yes: '20',
                no: '0',
                minParticipation: 10,
            });

            expect(crispProposalUtils.hasSucceeded(proposal)).toBeTruthy();
        });

        it('is true for an executed proposal, as the contract reports it', () => {
            const proposal = buildProposal({
                yes: '0',
                no: '0',
                isTallyPublished: false,
                isExecuted: true,
            });

            expect(crispProposalUtils.hasSucceeded(proposal)).toBeTruthy();
        });
    });

    describe('failed round', () => {
        const buildFailedProposal = (params?: {
            endDate?: number;
            isExecuted?: boolean;
        }) => ({
            ...buildProposal({
                yes: '0',
                no: '0',
                isTallyPublished: false,
                endDate: params?.endDate,
                isExecuted: params?.isExecuted,
            }),
            failureReason: CrispE3FailureReason.COMPUTE_TIMEOUT,
        });

        it('is failed once the voting window has closed', () => {
            expect(
                crispProposalUtils.getProposalStatus(buildFailedProposal()),
            ).toEqual(ProposalStatus.FAILED);
        });

        it('is failed while the voting window is still open', () => {
            const proposal = buildFailedProposal({ endDate: future });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.FAILED,
            );
        });

        it('has not succeeded', () => {
            expect(
                crispProposalUtils.hasSucceeded(buildFailedProposal()),
            ).toBeFalsy();
        });

        it('stays executed when the proposal was executed', () => {
            const proposal = buildFailedProposal({ isExecuted: true });

            expect(crispProposalUtils.getProposalStatus(proposal)).toEqual(
                ProposalStatus.EXECUTED,
            );
        });
    });

    describe('getFailureCause', () => {
        it.each([
            [CrispE3FailureReason.COMMITTEE_FORMATION_TIMEOUT, 'committee'],
            [CrispE3FailureReason.DKG_INVALID_SHARES, 'committee'],
            [CrispE3FailureReason.NO_INPUTS_RECEIVED, 'compute'],
            [CrispE3FailureReason.COMPUTE_TIMEOUT, 'compute'],
            [CrispE3FailureReason.DECRYPTION_TIMEOUT, 'decryption'],
            [CrispE3FailureReason.VERIFICATION_FAILED, 'decryption'],
            [CrispE3FailureReason.REQUESTER_CANCELLED, 'unknown'],
            [CrispE3FailureReason.NONE, 'unknown'],
        ])('maps reason %s to the %s phase', (reason, cause) => {
            expect(crispProposalUtils.getFailureCause(reason)).toEqual(cause);
        });
    });

    describe('getRoundPhase', () => {
        const buildRound = (params: {
            startDate?: number;
            endDate?: number;
            e3Stage?: CrispE3Stage;
        }) =>
            generateCrispProposal({
                startDate: params.startDate ?? past,
                endDate: params.endDate ?? past,
                e3Stage: params.e3Stage,
            });

        it('is scheduled before the window opens, whatever the stage', () => {
            const proposal = buildRound({
                startDate: future,
                endDate: future,
                e3Stage: CrispE3Stage.KEY_PUBLISHED,
            });

            expect(crispProposalUtils.getRoundPhase(proposal)).toEqual(
                'scheduled',
            );
        });

        it('is voting while the window is open, whatever the stage', () => {
            const proposal = buildRound({
                endDate: future,
                e3Stage: CrispE3Stage.REQUESTED,
            });

            expect(crispProposalUtils.getRoundPhase(proposal)).toEqual(
                'voting',
            );
        });

        it.each([
            [CrispE3Stage.REQUESTED, 'keyGeneration'],
            [CrispE3Stage.COMMITTEE_FINALIZED, 'keyGeneration'],
            [CrispE3Stage.KEY_PUBLISHED, 'computing'],
            [undefined, 'computing'],
            [CrispE3Stage.CIPHERTEXT_READY, 'decrypting'],
            [CrispE3Stage.COMPLETE, 'decrypting'],
        ])(
            'maps stage %s of a closed round to the %s phase',
            (e3Stage, phase) => {
                expect(
                    crispProposalUtils.getRoundPhase(buildRound({ e3Stage })),
                ).toEqual(phase);
            },
        );
    });

    describe('getRoundPhaseDeadline', () => {
        it('is the deadline of the stage a closed round is in, in milliseconds', () => {
            const proposal = generateCrispProposal({
                startDate: past,
                endDate: past,
                e3Stage: CrispE3Stage.CIPHERTEXT_READY,
                e3StageDeadline: 1_793_917_932,
            });

            expect(crispProposalUtils.getRoundPhaseDeadline(proposal)).toEqual(
                1_793_917_932_000,
            );
        });

        it('is not shown while the window is open, the deadline being the computation one', () => {
            const proposal = generateCrispProposal({
                startDate: past,
                endDate: future,
                e3Stage: CrispE3Stage.KEY_PUBLISHED,
                e3StageDeadline: 1_793_917_932,
            });

            expect(
                crispProposalUtils.getRoundPhaseDeadline(proposal),
            ).toBeUndefined();
        });
    });
});
