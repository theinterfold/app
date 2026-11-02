import { crispBallotWeightUtils } from './crispBallotWeightUtils';

const identity = {
    roundId: '7',
    voter: '0xAbC0000000000000000000000000000000000001',
    available: BigInt(1000),
    randomize: true,
};

describe('crispBallotWeight utils', () => {
    describe('chooseWeight', () => {
        it('stays within [available - floor(available / 100), available - 1] when randomizing', () => {
            const available = BigInt(1050);

            for (let attempt = 0; attempt < 500; attempt++) {
                const counted = crispBallotWeightUtils.chooseWeight(
                    available,
                    true,
                );

                expect(counted).toBeGreaterThanOrEqual(BigInt(1040));
                expect(counted).toBeLessThanOrEqual(BigInt(1049));
            }
        });

        it('reaches both ends of the band', () => {
            const seen = new Set<bigint>();

            for (let attempt = 0; attempt < 2000; attempt++) {
                seen.add(
                    crispBallotWeightUtils.chooseWeight(BigInt(300), true),
                );
            }

            expect(seen).toEqual(
                new Set([BigInt(297), BigInt(298), BigInt(299)]),
            );
        });

        it('counts the whole power when randomization is off', () => {
            expect(
                crispBallotWeightUtils.chooseWeight(BigInt(1000), false),
            ).toEqual(BigInt(1000));
        });

        it('counts the whole power below 100 ballot units', () => {
            expect(
                crispBallotWeightUtils.chooseWeight(BigInt(99), true),
            ).toEqual(BigInt(99));
        });

        it('takes exactly one unit off at 100 ballot units', () => {
            expect(
                crispBallotWeightUtils.chooseWeight(BigInt(100), true),
            ).toEqual(BigInt(99));
        });

        it('refuses a voter without voting power', () => {
            expect(() =>
                crispBallotWeightUtils.chooseWeight(BigInt(0), true),
            ).toThrow(/No voting power/);
        });
    });

    describe('assertReviewed', () => {
        const review = { ...identity, counted: BigInt(995) };

        it('returns the reviewed weight, whatever the casing of the voter', () => {
            expect(
                crispBallotWeightUtils.assertReviewed(review, {
                    ...identity,
                    voter: identity.voter.toLowerCase(),
                }),
            ).toEqual(BigInt(995));
        });

        it('rejects a review made for another round, voter or voting power', () => {
            expect(() =>
                crispBallotWeightUtils.assertReviewed(review, {
                    ...identity,
                    roundId: '8',
                }),
            ).toThrow(/Review the ballot/);
            expect(() =>
                crispBallotWeightUtils.assertReviewed(review, {
                    ...identity,
                    voter: '0x0000000000000000000000000000000000000002',
                }),
            ).toThrow(/Review the ballot/);
            expect(() =>
                crispBallotWeightUtils.assertReviewed(review, {
                    ...identity,
                    available: BigInt(900),
                }),
            ).toThrow(/Review the ballot/);
        });

        it('rejects a weight outside the allowed band', () => {
            const tooLow = { ...review, counted: BigInt(500) };
            const whole = { ...review, counted: BigInt(1000) };

            expect(() =>
                crispBallotWeightUtils.assertReviewed(tooLow, identity),
            ).toThrow();
            // A randomized review that counts the whole power was never chosen by `chooseWeight`.
            expect(() =>
                crispBallotWeightUtils.assertReviewed(whole, identity),
            ).toThrow();
        });

        it('accepts only the whole power when randomization is off', () => {
            const whole = {
                ...review,
                randomize: false,
                counted: BigInt(1000),
            };

            expect(
                crispBallotWeightUtils.assertReviewed(whole, identity),
            ).toEqual(BigInt(1000));
            expect(() =>
                crispBallotWeightUtils.assertReviewed(
                    { ...whole, counted: BigInt(995) },
                    identity,
                ),
            ).toThrow();
        });

        it('rejects a missing review', () => {
            expect(() =>
                crispBallotWeightUtils.assertReviewed(undefined, identity),
            ).toThrow();
        });
    });

    describe('percentage', () => {
        it('rounds down to two decimals', () => {
            expect(
                crispBallotWeightUtils.percentage({
                    counted: BigInt(9947),
                    unit: BigInt(1),
                    power: BigInt(10_000),
                }),
            ).toEqual('99.47%');
            expect(
                crispBallotWeightUtils.percentage({
                    counted: BigInt(2),
                    unit: BigInt(1),
                    power: BigInt(3),
                }),
            ).toEqual('66.66%');
        });

        it('never shows 100% for a ballot that loses any power', () => {
            expect(
                crispBallotWeightUtils.percentage({
                    counted: BigInt(9999),
                    unit: BigInt(1),
                    power: BigInt(10_000),
                }),
            ).toEqual('99.99%');
        });

        it('counts the remainder whole ballot units leave out as lost', () => {
            // 10 raw units per ballot unit; 105 raw power -> 10 units, counting all 10 is 100 of 105.
            expect(
                crispBallotWeightUtils.percentage({
                    counted: BigInt(10),
                    unit: BigInt(10),
                    power: BigInt(105),
                }),
            ).toEqual('95.23%');
        });

        it('shows the full share when the whole power counts', () => {
            expect(
                crispBallotWeightUtils.percentage({
                    counted: BigInt(10),
                    unit: BigInt(10),
                    power: BigInt(100),
                }),
            ).toEqual('100.00%');
        });
    });
});
