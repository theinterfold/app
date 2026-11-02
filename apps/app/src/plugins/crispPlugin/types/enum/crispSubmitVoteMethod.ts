/**
 * How an encrypted ballot reaches the chain. Both paths submit the identical payload and produce
 * the identical on-chain state; they differ in who pays and who can stop it.
 */
export enum CrispSubmitVoteMethod {
    /**
     * The CRISP server relays the ballot. Costs the voter nothing, but the server can drop it.
     */
    RELAY = 'RELAY',
    /**
     * The voter sends the transaction themselves. Costs gas, and nobody can withhold it.
     */
    DIRECT = 'DIRECT',
}
