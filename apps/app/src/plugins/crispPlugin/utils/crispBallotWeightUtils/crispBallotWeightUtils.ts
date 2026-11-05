import { CrispError } from '../../types';

export interface ICrispBallotWeight {
    /**
     * Round the weight was chosen for, as a decimal string.
     */
    roundId: string;
    /**
     * Voter the weight was chosen for.
     */
    voter: string;
    /**
     * Voting power the ballot can spend, in ballot units (`CRISPProgram.votingPowerOf`).
     */
    available: bigint;
    /**
     * Defines if the weight was chosen at random below the voting power.
     */
    randomize: boolean;
    /**
     * Weight the ballot counts, in ballot units.
     */
    counted: bigint;
}

// Voting powers below this many ballot units have no smaller whole number within 1%.
const minRandomizablePower = BigInt(100);

/**
 * The weight a ballot counts, which can be a little below the voting power the proof names.
 *
 * Voting powers are public and the tally publishes the total of each option, so a ballot counting
 * exactly its voting power turns the totals into a subset-sum problem that can reveal how each
 * voter voted. A random weight removes the exact match at the cost of at most 1% of the weight of
 * the voter. The proof still names the full voting power, the circuit only requires the counted
 * weight not to exceed it.
 */
class CrispBallotWeightUtils {
    /**
     * Uniform cryptographic sampling in `[0, limit)`, redrawing instead of using a modulo to avoid
     * bias.
     */
    private randomBelow = (limit: bigint): bigint => {
        if (limit === BigInt(1)) {
            return BigInt(0);
        }

        const bits = (limit - BigInt(1)).toString(2).length;
        const bytes = new Uint8Array(Math.ceil(bits / 8));
        const mask = (1 << (((bits - 1) % 8) + 1)) - 1;

        for (;;) {
            globalThis.crypto.getRandomValues(bytes);
            bytes[0] &= mask;

            const value = bytes.reduce(
                (total, byte) => (total << BigInt(8)) | BigInt(byte),
                BigInt(0),
            );

            if (value < limit) {
                return value;
            }
        }
    };

    /**
     * Chooses the weight a ballot counts: a uniformly random whole number of ballot units in
     * `[available - floor(available / 100), available - 1]` when `randomize` is on, else
     * `available`. A power below 100 units counts whole.
     */
    chooseWeight = (available: bigint, randomize: boolean): bigint => {
        if (available <= BigInt(0)) {
            throw new Error('No voting power is available for this ballot.');
        }

        const maxReduction = available / minRandomizablePower;

        if (!randomize || maxReduction === BigInt(0)) {
            return available;
        }

        return available - BigInt(1) - this.randomBelow(maxReduction);
    };

    /**
     * Rechecks a reviewed weight against the voting power the program reports now, without
     * choosing it again.
     *
     * @returns The weight to count.
     * @throws When the review was made for another round, voter or voting power, or is out of band.
     */
    assertReviewed = (
        weight: ICrispBallotWeight | undefined,
        current: Pick<ICrispBallotWeight, 'roundId' | 'voter' | 'available'>,
    ): bigint => {
        if (
            weight == null ||
            weight.roundId !== current.roundId ||
            weight.voter.toLowerCase() !== current.voter.toLowerCase() ||
            weight.available !== current.available
        ) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.reviewInvalid',
            );
        }

        const { counted, available, randomize } = weight;
        const isWithinBand =
            randomize && available >= minRandomizablePower
                ? counted < available &&
                  counted * minRandomizablePower >= available * BigInt(99)
                : counted === available;

        if (counted <= BigInt(0) || !isWithinBand) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.reviewInvalid',
            );
        }

        return counted;
    };

    /**
     * The counted weight as a percentage of the full voting power, rounded down to two decimals,
     * for example `"99.47%"`. It compares tokens, not ballot units, so it also shows the remainder
     * that whole units leave out. Rounded down so that a ballot losing any power never shows 100%.
     *
     * @param params.counted Counted weight, in ballot units.
     * @param params.unit Raw token units in one ballot unit (`votingPowerDivisorOf`).
     * @param params.power Voting power at the snapshot, in raw token units.
     */
    percentage = (params: {
        counted: bigint;
        unit: bigint;
        power: bigint;
    }): string => {
        const { counted, unit, power } = params;

        if (power <= BigInt(0)) {
            return '0.00%';
        }

        const hundredths = (counted * unit * BigInt(10_000)) / power;

        return `${String(hundredths / BigInt(100))}.${(hundredths % BigInt(100)).toString().padStart(2, '0')}%`;
    };
}

export const crispBallotWeightUtils = new CrispBallotWeightUtils();
