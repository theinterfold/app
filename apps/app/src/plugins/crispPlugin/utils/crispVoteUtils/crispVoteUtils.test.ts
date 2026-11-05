import { VoteOption } from '@/plugins/tokenPlugin/types';
import { crispVoteUtils } from './crispVoteUtils';

describe('crispVote utils', () => {
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
            ).toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.weightTooLarge',
                }),
            );
        });
    });

    describe('buildMask', () => {
        it('is zero on each of the three options so it adds nothing to the tally', () => {
            expect(crispVoteUtils.buildMask()).toEqual([0, 0, 0]);
        });
    });
});
