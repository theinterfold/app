/**
 * Lifecycle stage of an Interfold (E3) round, mirroring `IInterfold.E3Stage`.
 */
export enum CrispE3Stage {
    NONE = 0,
    REQUESTED = 1,
    COMMITTEE_FINALIZED = 2,
    KEY_PUBLISHED = 3,
    CIPHERTEXT_READY = 4,
    COMPLETE = 5,
    FAILED = 6,
}
