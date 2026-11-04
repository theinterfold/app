import type { Network } from '@/shared/api/daoService';
import type { ICrispQuoteCall } from '../../utils/crispFeeUtils';

/**
 * Why a deposit did not happen.
 * - `unavailable`: the quote, the credit or the fee token could not be read.
 * - `balance`: the wallet does not hold the fee-token amount to deposit.
 * - `rejected`: the wallet declined to sign the approval or the deposit.
 * - `transaction`: the approval or the deposit reverted or could not be sent.
 * - `unconfirmed`: the deposit was sent but its confirmation could not be read.
 */
export type CrispDepositFailure =
    | 'unavailable'
    | 'balance'
    | 'rejected'
    | 'transaction'
    | 'unconfirmed';

export interface IUseCrispFeeCreditsParams {
    /**
     * Address of the CRISP plugin holding the fee credit.
     */
    pluginAddress: string;
    /**
     * Network of the plugin.
     */
    network: Network;
    /**
     * Quote calls of the proposals the credit has to pay for, see `crispFeeUtils.getQuoteCalls`.
     * Must be referentially stable. Omit it to only read the credit.
     */
    quoteCalls?: ICrispQuoteCall[];
}

export interface IUseCrispFeeCreditsResult {
    /**
     * Fee of all the proposals quoted, in fee-token units. Undefined while loading or when any
     * quote reverts.
     */
    quote?: bigint;
    /**
     * Fee credit of the connected wallet on the plugin, in fee-token units.
     */
    credit?: bigint;
    /**
     * Decimals of the fee token.
     */
    decimals?: number;
    /**
     * Symbol of the fee token.
     */
    symbol?: string;
    /**
     * Whether the credit covers the quote. False while any read is unknown.
     */
    hasSufficientCredit: boolean;
    /**
     * Approves the fee token when needed and deposits the shortfall plus a buffer. Resolves to
     * false instead of throwing when the deposit did not happen.
     */
    depositShortfall: () => Promise<boolean>;
    /**
     * Defines if the approval / deposit transactions are in flight.
     */
    isDepositing: boolean;
    /**
     * Defines if the quote, the credit or the fee token are loading.
     */
    isLoading: boolean;
    /**
     * Set when a quote reverted, which points at the E3 configuration of the plugin.
     */
    quoteError?: Error;
    /**
     * Reason of the last failed deposit.
     */
    depositFailure?: CrispDepositFailure;
    /**
     * Re-reads the credit, e.g. after a withdrawal.
     */
    refetchCredit: () => Promise<unknown>;
}
