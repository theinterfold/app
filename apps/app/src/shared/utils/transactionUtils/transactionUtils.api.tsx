import type { Hex } from 'viem';

export interface ITransactionRequest {
    /**
     * Target of the transaction.
     */
    to: Hex;
    /**
     * Data of the transaction.
     */
    data: Hex;
    /**
     * Value of the transaction, marked as required because it is needed for most of the smart contract functions (e.g. create-proposal)
     */
    value: bigint;
    /**
     * Gas limit of the transaction, left to the wallet when not set.
     */
    gas?: bigint;
}
