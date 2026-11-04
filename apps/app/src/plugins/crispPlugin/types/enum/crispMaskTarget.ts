/**
 * Whose voting slot a mask is written to. A mask is a zero ballot that anyone can write, unsigned,
 * to any eligible slot, so an observer cannot tell whether the owner of a slot really voted.
 */
export enum CrispMaskTarget {
    /**
     * The slot of the connected wallet, which makes its own on-chain activity ambiguous.
     */
    SELF = 'SELF',
    /**
     * A uniformly random eligible member of the CRISP body.
     */
    RANDOM = 'RANDOM',
}
