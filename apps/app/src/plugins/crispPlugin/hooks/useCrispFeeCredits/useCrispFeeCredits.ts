'use client';

import { useCallback, useMemo, useState } from 'react';
import { erc20Abi, type Hex } from 'viem';
import { useReadContract, useReadContracts, useWriteContract } from 'wagmi';
import { readContract, waitForTransactionReceipt } from 'wagmi/actions';
import { wagmiConfig } from '@/modules/application/constants/wagmi';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import { useDaoChain } from '@/shared/hooks/useDaoChain';
import { useToken } from '@/shared/hooks/useToken';
import { crispFeeUtils, type ICrispQuoteCall } from '../../utils/crispFeeUtils';
import { crispPluginAbi } from '../../utils/crispTransactionUtils/crispPluginAbi';
import type {
    CrispDepositFailure,
    IUseCrispFeeCreditsParams,
    IUseCrispFeeCreditsResult,
} from './useCrispFeeCredits.api';

const noQuoteCalls: ICrispQuoteCall[] = [];

/**
 * Manages the fee credit held on the plugin, from which the creator of a CRISP proposal pays the
 * fee of the E3 computation. The fee scales with the voting window, so it is quoted for the given
 * calls. The hook never reports a sufficient credit nor deposits when any read is unknown.
 */
export const useCrispFeeCredits = (
    params: IUseCrispFeeCreditsParams,
): IUseCrispFeeCreditsResult => {
    const { network, quoteCalls = noQuoteCalls } = params;

    const { address } = useWalletAccount();
    const { chainId } = useDaoChain({ network });

    const pluginAddress = params.pluginAddress as Hex;

    const [isDepositing, setIsDepositing] = useState(false);
    const [depositFailure, setDepositFailure] = useState<CrispDepositFailure>();

    const { data: feeToken, isLoading: isFeeTokenLoading } = useReadContract({
        chainId,
        address: pluginAddress,
        abi: crispPluginAbi,
        functionName: 'interfoldFeeToken',
        query: { enabled: chainId != null },
    });

    const { data: token, isLoading: isTokenLoading } = useToken({
        address: feeToken,
        chainId,
    });

    const quoteContracts = useMemo(
        () =>
            quoteCalls.map((call) => ({
                chainId,
                address: pluginAddress,
                abi: crispPluginAbi,
                functionName: call.functionName,
                args: call.args,
            })),
        [quoteCalls, chainId, pluginAddress],
    );

    const { data: quoteResults, isLoading: isQuoteLoading } = useReadContracts({
        // The calls are a union of two functions, which wagmi cannot infer per element
        contracts: quoteContracts as never,
        query: { enabled: chainId != null && quoteContracts.length > 0 },
    });

    const typedQuoteResults = quoteResults as
        | readonly {
              status: 'success' | 'failure';
              result?: bigint;
              error?: Error;
          }[]
        | undefined;

    const quote = crispFeeUtils.sumQuotes(
        quoteCalls.map((_, index) =>
            typedQuoteResults?.[index]?.status === 'success'
                ? typedQuoteResults[index].result
                : undefined,
        ),
    );
    const quoteError = typedQuoteResults?.find(
        (result) => result.status === 'failure',
    )?.error;

    const {
        data: credit,
        isLoading: isCreditLoading,
        refetch: refetchCredit,
    } = useReadContract({
        chainId,
        address: pluginAddress,
        abi: crispPluginAbi,
        functionName: 'feeCredits',
        args: [address as Hex],
        query: { enabled: chainId != null && address != null },
    });

    const { writeContractAsync } = useWriteContract();

    const fail = useCallback((failure: CrispDepositFailure): false => {
        setDepositFailure(failure);

        return false;
    }, []);

    // Memoized because it ends up in the dependencies of the steps of the publish dialog
    const depositShortfall = useCallback(async (): Promise<boolean> => {
        setDepositFailure(undefined);

        if (
            quote == null ||
            credit == null ||
            feeToken == null ||
            chainId == null ||
            address == null
        ) {
            return fail('unavailable');
        }

        const amount = crispFeeUtils.depositAmount(quote, credit);

        if (amount <= BigInt(0)) {
            return true;
        }

        setIsDepositing(true);

        try {
            // Read fresh as the wallet may have changed since the reads of the render
            const [balance, allowance] = await Promise.all([
                readContract(wagmiConfig, {
                    chainId,
                    address: feeToken,
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [address],
                }),
                readContract(wagmiConfig, {
                    chainId,
                    address: feeToken,
                    abi: erc20Abi,
                    functionName: 'allowance',
                    args: [address, pluginAddress],
                }),
            ]);

            // Checked before signing anything to not pay for an approval the deposit cannot use
            if (balance < amount) {
                return fail('balance');
            }

            if (allowance < amount) {
                const approveHash = await writeContractAsync({
                    chainId,
                    address: feeToken,
                    abi: erc20Abi,
                    functionName: 'approve',
                    args: [pluginAddress, amount],
                });
                await waitForTransactionReceipt(wagmiConfig, {
                    hash: approveHash,
                    chainId,
                });
            }

            const depositHash = await writeContractAsync({
                chainId,
                address: pluginAddress,
                abi: crispPluginAbi,
                functionName: 'deposit',
                args: [amount],
            });
            await waitForTransactionReceipt(wagmiConfig, {
                hash: depositHash,
                chainId,
            });

            await refetchCredit();

            return true;
        } catch {
            return fail('transaction');
        } finally {
            setIsDepositing(false);
        }
    }, [
        quote,
        credit,
        feeToken,
        chainId,
        address,
        pluginAddress,
        writeContractAsync,
        fail,
        refetchCredit,
    ]);

    return {
        quote,
        credit,
        decimals: token?.decimals,
        symbol: token?.symbol,
        hasSufficientCredit: crispFeeUtils.hasSufficientCredit(quote, credit),
        depositShortfall,
        isDepositing,
        isLoading:
            isFeeTokenLoading ||
            isTokenLoading ||
            isQuoteLoading ||
            isCreditLoading,
        quoteError,
        depositFailure,
        refetchCredit,
    };
};
