import { ProposalStatus } from '@aragon/gov-ui-kit';
import { DateTime } from 'luxon';
import { formatUnits } from 'viem';
import { VoteOption } from '@/plugins/tokenPlugin/types';
import { tokenProposalUtils } from '@/plugins/tokenPlugin/utils/tokenProposalUtils';
import { bigIntUtils } from '@/shared/utils/bigIntUtils';
import { proposalStatusUtils } from '@/shared/utils/proposalStatusUtils';
import {
    CrispE3FailureReason,
    CrispE3Stage,
    type ICrispProposal,
} from '../../types';

// CRISP percentages are whole numbers out of 100 instead of the ppm used by token voting
const ratioBase = BigInt(100);

// Steps of a round whose tally is not known yet: the window opens, ballots are cast, then the
// ballots are tallied under encryption and the committee decrypts the tally. A window that closed
// before the committee published its key is stuck on the key.
export type CrispRoundPhase =
    | 'scheduled'
    | 'voting'
    | 'keyGeneration'
    | 'computing'
    | 'decrypting';

class CrispProposalUtils {
    getProposalStatus = (proposal: ICrispProposal): ProposalStatus => {
        const { startDate, endDate, hasActions, executed } = proposal;

        // A failed round never publishes a tally
        if (proposal.failureReason != null && !executed.status) {
            return ProposalStatus.FAILED;
        }

        const hasEnded = proposalStatusUtils.hasEnded({
            isExecuted: executed.status,
            endDate,
        });

        // The outcome is unknown until the committee publishes the decrypted tally
        if (hasEnded && !executed.status && !this.isTallyResolved(proposal)) {
            return ProposalStatus.PENDING;
        }

        return proposalStatusUtils.getProposalStatus({
            isExecuted: executed.status,
            isVetoed: false,
            startDate,
            endDate,
            paramsMet:
                this.isTallyResolved(proposal) &&
                this.isApprovalReached(proposal),
            hasActions,
            canExecuteEarly: false,
        });
    };

    // Mirrors CrispVoting.hasSucceeded
    hasSucceeded = (proposal: ICrispProposal) => {
        const { executed, endDate } = proposal;

        if (executed.status) {
            return true;
        }

        const hasEnded = proposalStatusUtils.hasEnded({
            isExecuted: false,
            endDate,
        });

        return (
            hasEnded &&
            this.isTallyResolved(proposal) &&
            this.isApprovalReached(proposal)
        );
    };

    // The backend serves the tally once the round divisor is known
    isTallyResolved = (proposal: ICrispProposal): boolean =>
        proposal.isTallyPublished &&
        bigIntUtils.safeParse(proposal.votingPowerDivisor) > BigInt(0);

    // Nothing left to wait for: the proposal was executed, its round failed or the tally is published
    isSettled = (proposal: ICrispProposal): boolean =>
        proposal.executed.status ||
        proposal.failureReason != null ||
        proposal.isTallyPublished;

    isApprovalReached = (proposal: ICrispProposal): boolean =>
        this.isMinParticipationReached(proposal) &&
        this.isSupportReached(proposal);

    // The backend serves the votes in raw token units
    isMinParticipationReached = (proposal: ICrispProposal): boolean => {
        const { minParticipation, historicalTotalSupply } = proposal.settings;

        const totalSupply = bigIntUtils.safeParse(historicalTotalSupply);

        if (totalSupply === BigInt(0)) {
            return false;
        }

        return (
            this.getTotalVotes(proposal) * ratioBase >=
            BigInt(Math.round(minParticipation)) * totalSupply
        );
    };

    // Yes must strictly exceed the support threshold share of yes + no, abstentions excluded
    isSupportReached = (proposal: ICrispProposal): boolean => {
        const { votesByOption } = proposal.metrics;
        const supportThreshold = BigInt(
            Math.round(proposal.settings.supportThreshold),
        );

        const yes = tokenProposalUtils.getVoteByType(
            votesByOption,
            VoteOption.YES,
        );
        const no = tokenProposalUtils.getVoteByType(
            votesByOption,
            VoteOption.NO,
        );

        return (ratioBase - supportThreshold) * yes > supportThreshold * no;
    };

    getTotalVotes = (proposal: ICrispProposal): bigint =>
        proposal.metrics.votesByOption.reduce(
            (accumulator, current) =>
                accumulator + bigIntUtils.safeParse(current.totalVotingPower),
            BigInt(0),
        );

    getOptionVotingPower = (proposal: ICrispProposal, option: VoteOption) => {
        const votes = proposal.metrics.votesByOption.find(
            (vote) => vote.type === option,
        );

        return formatUnits(
            bigIntUtils.safeParse(votes?.totalVotingPower),
            proposal.settings.token.decimals,
        );
    };

    // CrispVoting.execute() is not guarded by the EXECUTE_PROPOSAL_PERMISSION
    hasExecuteProposalPermissionModifier = () => false;

    // Where a round whose tally is not known and that has not failed stands. Past the window, the
    // step comes from the last Interfold stage the backend read, a round it has not read yet is
    // taken to be computing.
    getRoundPhase = (proposal: ICrispProposal): CrispRoundPhase => {
        const { startDate, endDate, e3Stage } = proposal;

        if (DateTime.now().toSeconds() < startDate) {
            return 'scheduled';
        }

        if (!proposalStatusUtils.hasEnded({ isExecuted: false, endDate })) {
            return 'voting';
        }

        switch (e3Stage) {
            case CrispE3Stage.NONE:
            case CrispE3Stage.REQUESTED:
            case CrispE3Stage.COMMITTEE_FINALIZED:
                return 'keyGeneration';
            // A complete round is decrypted, its tally is on the way to the backend
            case CrispE3Stage.CIPHERTEXT_READY:
            case CrispE3Stage.COMPLETE:
                return 'decrypting';
            default:
                return 'computing';
        }
    };

    // The deadline of the step a closed round is in, in milliseconds: the round fails if the
    // step has not finished by then. Undefined while the window is open, and when the backend
    // has not read it.
    getRoundPhaseDeadline = (proposal: ICrispProposal): number | undefined => {
        const phase = this.getRoundPhase(proposal);

        if (
            phase === 'scheduled' ||
            phase === 'voting' ||
            proposal.e3StageDeadline == null
        ) {
            return undefined;
        }

        return proposal.e3StageDeadline * 1000;
    };

    // Groups the failure reasons by the phase of the round that went wrong
    getFailureCause = (
        reason: CrispE3FailureReason,
    ): 'committee' | 'compute' | 'decryption' | 'unknown' => {
        switch (reason) {
            case CrispE3FailureReason.COMMITTEE_FORMATION_TIMEOUT:
            case CrispE3FailureReason.INSUFFICIENT_COMMITTEE_MEMBERS:
            case CrispE3FailureReason.DKG_TIMEOUT:
            case CrispE3FailureReason.DKG_INVALID_SHARES:
                return 'committee';
            case CrispE3FailureReason.NO_INPUTS_RECEIVED:
            case CrispE3FailureReason.COMPUTE_TIMEOUT:
            case CrispE3FailureReason.COMPUTE_PROVIDER_EXPIRED:
            case CrispE3FailureReason.COMPUTE_PROVIDER_FAILED:
                return 'compute';
            case CrispE3FailureReason.DECRYPTION_TIMEOUT:
            case CrispE3FailureReason.DECRYPTION_INVALID_SHARES:
            case CrispE3FailureReason.VERIFICATION_FAILED:
                return 'decryption';
            default:
                return 'unknown';
        }
    };
}

export const crispProposalUtils = new CrispProposalUtils();
