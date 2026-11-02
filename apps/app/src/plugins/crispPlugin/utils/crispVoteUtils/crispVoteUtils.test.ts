import { VoteOption } from '@/plugins/tokenPlugin/types';
import { crispVoteUtils } from './crispVoteUtils';

describe('crispVote utils', () => {
    describe('toVoteOption', () => {
        it('maps the positional CRISP options onto the Aragon vote options', () => {
            expect(crispVoteUtils.toVoteOption(0)).toEqual(VoteOption.YES);
            expect(crispVoteUtils.toVoteOption(1)).toEqual(VoteOption.NO);
            expect(crispVoteUtils.toVoteOption(2)).toEqual(VoteOption.ABSTAIN);
        });

        it('returns undefined for an index outside the three options', () => {
            expect(crispVoteUtils.toVoteOption(3)).toBeUndefined();
            expect(crispVoteUtils.toVoteOption(-1)).toBeUndefined();
        });
    });

    describe('buildBallot', () => {
        it('places the weight on the CRISP position of the chosen option and zero on the others', () => {
            expect(
                crispVoteUtils.buildBallot(VoteOption.YES, BigInt(42)),
            ).toEqual([42, 0, 0]);
            expect(
                crispVoteUtils.buildBallot(VoteOption.NO, BigInt(42)),
            ).toEqual([0, 42, 0]);
            expect(
                crispVoteUtils.buildBallot(VoteOption.ABSTAIN, BigInt(42)),
            ).toEqual([0, 0, 42]);
        });

        it('refuses a voting power the SDK cannot represent exactly', () => {
            const tooLarge = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);

            expect(() =>
                crispVoteUtils.buildBallot(VoteOption.YES, tooLarge),
            ).toThrow(/too large/);
        });
    });
});
