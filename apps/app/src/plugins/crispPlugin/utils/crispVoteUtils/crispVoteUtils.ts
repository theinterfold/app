import { VoteOption } from '@/plugins/tokenPlugin/types';

/**
 * Aragon vote option of each CRISP option, by position: CRISP orders the options YES, NO, ABSTAIN
 * both in the ballot and in the on-chain tally, which is not the order of Aragon's `VoteOption`.
 */
const crispVoteOptions = [VoteOption.YES, VoteOption.NO, VoteOption.ABSTAIN];

class CrispVoteUtils {
    /**
     * Maps a CRISP option index to the Aragon vote option, returning undefined for an index
     * outside the three options of a CRISP proposal.
     */
    toVoteOption = (index: number): VoteOption | undefined =>
        crispVoteOptions[index];

    /**
     * Builds the ballot to encrypt: the weight on the chosen option and zero on the others. The SDK
     * takes the weights as JS numbers, so a weight beyond the safe integer range is refused
     * instead of silently losing precision.
     */
    buildBallot = (option: VoteOption, weight: bigint): number[] => {
        if (weight > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error(
                'The voting power is too large to be encoded in a ballot.',
            );
        }

        return crispVoteOptions.map((crispOption) =>
            crispOption === option ? Number(weight) : 0,
        );
    };
}

export const crispVoteUtils = new CrispVoteUtils();
