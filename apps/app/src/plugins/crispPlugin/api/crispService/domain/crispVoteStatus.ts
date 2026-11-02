/**
 * Slot activity of an address in a round (`voting/status`), limited to the fields the app reads.
 */
export interface ICrispVoteStatus {
    /**
     * Defines if the slot holds at least one published entry, either an earlier ballot of the
     * voter or a mask written by somebody else. A new ballot replaces it.
     */
    slot_active: boolean;
}
