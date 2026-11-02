import { ProposalStatus } from '@aragon/gov-ui-kit';
import { formatUnits } from 'viem';
import {
    type ITokenProposalOptionVotes,
    VoteOption,
} from '@/plugins/tokenPlugin/types';
import { bigIntUtils } from '@/shared/utils/bigIntUtils';
import { proposalStatusUtils } from '@/shared/utils/proposalStatusUtils';
import { CrispE3FailureReason, type ICrispProposal } from '../../types';

// CRISP percentages are whole numbers out of 100 instead of the ppm used by token voting
const ratioBase = BigInt(100);

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

    // The tally counts are in units of the round divisor, so they cannot be converted without it
    isTallyResolved = (proposal: ICrispProposal): boolean =>
        proposal.isTallyPublished &&
        bigIntUtils.safeParse(proposal.votingPowerDivisor) > BigInt(0);

    isApprovalReached = (proposal: ICrispProposal): boolean =>
        this.isMinParticipationReached(proposal) &&
        this.isSupportReached(proposal);

    // The votes are in raw token units (the resolver multiplies the tally counts by the divisor)
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

        const yes = this.getVoteByType(votesByOption, VoteOption.YES);
        const no = this.getVoteByType(votesByOption, VoteOption.NO);

        return (ratioBase - supportThreshold) * yes > supportThreshold * no;
    };

    getTotalVotes = (proposal: ICrispProposal): bigint =>
        proposal.metrics.votesByOption.reduce(
            (accumulator, current) =>
                accumulator + bigIntUtils.safeParse(current.totalVotingPower),
            BigInt(0),
        );

    getVoteByType = (
        votes: ITokenProposalOptionVotes[],
        type: VoteOption,
    ): bigint => {
        const optionVotes = votes.find((option) => option.type === type);

        return bigIntUtils.safeParse(optionVotes?.totalVotingPower);
    };

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
