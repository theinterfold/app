import { decodeErrorResult, type Hex, parseAbi } from 'viem';
import { createProposalUtils } from '@/modules/governance/utils/createProposalUtils';
import type { ICreateCrispProposalFormData } from '../crispTransactionUtils';

export interface IResolveProposalDatesParams {
    /**
     * Creation form values of the proposal about to be published.
     */
    proposal: ICreateCrispProposalFormData;
    /**
     * Current time in seconds.
     */
    now: number;
}

export interface ICrispProposalDates {
    /**
     * Start date sent to the contract, `0` meaning "as soon as possible".
     */
    startDate: number;
    /**
     * End date sent to the contract, `0` meaning "start date + minimum duration".
     */
    endDate: number;
}

export interface IGetQuoteCallsParams extends IResolveProposalDatesParams {
    /**
     * Voting windows (in seconds) of the stages of a staged process the plugin is a body of.
     * Empty or omitted for a proposal created directly.
     */
    stageDurations?: number[];
}

/**
 * Call of the plugin that quotes the fee of one proposal.
 */
export type ICrispQuoteCall =
    | { functionName: 'quoteProposalFeeForDuration'; args: readonly [bigint] }
    | {
          functionName: 'quoteProposalFee';
          args: readonly [bigint, bigint];
      };

// A staged process wraps the revert of its body, so the reason of the wrapper is decoded in turn
const insufficientCreditRevertAbi = parseAbi([
    'error InsufficientFeeCredit(address payer, uint256 required, uint256 available)',
    'error SubProposalCreationFailed(address plugin, bytes reason)',
]);

/**
 * The creator of a CRISP proposal pays the fee of the E3 computation from a credit held on the
 * plugin, which must cover the quote before the proposal can be created.
 */
class CrispFeeUtils {
    // Margin on top of the shortfall: the quote scales with the voting window, which slides
    // forward while the user is in the wizard, so the exact shortfall would make the proposal revert
    readonly feeBufferPercent = BigInt(10);

    shortfall = (quote?: bigint, credit?: bigint): bigint =>
        quote == null || credit == null || credit >= quote
            ? BigInt(0)
            : quote - credit;

    depositAmount = (quote?: bigint, credit?: bigint): bigint => {
        const shortfall = this.shortfall(quote, credit);

        return shortfall + (shortfall * this.feeBufferPercent) / BigInt(100);
    };

    // Unknown values count as insufficient: a retry is cheaper than a reverted transaction
    hasSufficientCredit = (quote?: bigint, credit?: bigint): boolean =>
        quote != null && credit != null && credit >= quote;

    // Whether creating a proposal reverted because the creator lacks fee credit, which the prerequisite steps top up
    isInsufficientCreditRevert = (revertData: Hex): boolean => {
        try {
            const { errorName, args } = decodeErrorResult({
                abi: insufficientCreditRevertAbi,
                data: revertData,
            });

            return (
                errorName === 'InsufficientFeeCredit' ||
                this.isInsufficientCreditRevert(args[1])
            );
        } catch {
            // Any other revert, which a deposit does not resolve
            return false;
        }
    };

    /**
     * Dates a direct proposal is created with. The quote and the transaction must use the same
     * ones because the fee depends on the resulting window.
     * - Without end date the end is left to the contract (`0`), instead of defaulting to the
     * seven days of the other plugins which would make the fee roughly eight times the minimum.
     * - An explicit end with "start now" sends `now` as start, because with a start of `0` the
     * contract reads the end as a duration.
     */
    resolveProposalDates = (
        params: IResolveProposalDatesParams,
    ): ICrispProposalDates => {
        const { proposal, now } = params;

        const startDate = createProposalUtils.parseStartDate(proposal);
        const endDate =
            proposal.endTimeMode != null
                ? createProposalUtils.parseEndDate(proposal)
                : 0;

        return endDate !== 0 && startDate === 0
            ? { startDate: now, endDate }
            : { startDate, endDate };
    };

    /**
     * Quote calls pricing the proposals about to be created on the plugin. A proposal of a staged
     * process is created with the voting window of the stage instead of the dates of the form,
     * and a body of multiple stages creates one proposal per stage.
     */
    getQuoteCalls = (params: IGetQuoteCallsParams): ICrispQuoteCall[] => {
        const { stageDurations, proposal, now } = params;

        if (stageDurations != null && stageDurations.length > 0) {
            return stageDurations.map((duration) => ({
                functionName: 'quoteProposalFeeForDuration',
                args: [BigInt(duration)],
            }));
        }

        const { startDate, endDate } = this.resolveProposalDates({
            proposal,
            now,
        });

        return [
            {
                functionName: 'quoteProposalFee',
                args: [BigInt(startDate), BigInt(endDate)],
            },
        ];
    };

    // Undefined when any quote is unknown, a partial sum would under-fund the credit
    sumQuotes = (quotes: (bigint | undefined)[]): bigint | undefined =>
        quotes.length > 0 && quotes.every((quote) => quote != null)
            ? quotes.reduce<bigint>((total, quote) => total + quote!, BigInt(0))
            : undefined;
}

export const crispFeeUtils = new CrispFeeUtils();
