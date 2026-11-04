import { act, renderHook } from '@testing-library/react';
import { UserRejectedRequestError } from 'viem';
import * as wagmi from 'wagmi';
import * as wagmiActions from 'wagmi/actions';
import * as useWalletAccountModule from '@/modules/application/hooks/useWalletAccount';
import { Network } from '@/shared/api/daoService';
import * as useDaoChainModule from '@/shared/hooks/useDaoChain';
import * as useTokenModule from '@/shared/hooks/useToken';
import { monitoringUtils } from '@/shared/utils/monitoringUtils';
import type { ICrispQuoteCall } from '../../utils/crispFeeUtils';
import { useCrispFeeCredits } from './useCrispFeeCredits';

const pluginAddress = '0x00000000000000000000000000000000000000c3';
const feeToken = '0x00000000000000000000000000000000000000f1';
const quoteCalls: ICrispQuoteCall[] = [
    { functionName: 'quoteProposalFeeForDuration', args: [BigInt(3600)] },
];

describe('useCrispFeeCredits hook', () => {
    const useWalletAccountSpy = jest.spyOn(
        useWalletAccountModule,
        'useWalletAccount',
    );
    const useDaoChainSpy = jest.spyOn(useDaoChainModule, 'useDaoChain');
    const useTokenSpy = jest.spyOn(useTokenModule, 'useToken');
    const useReadContractSpy = jest.spyOn(wagmi, 'useReadContract');
    const useReadContractsSpy = jest.spyOn(wagmi, 'useReadContracts');
    const useWriteContractSpy = jest.spyOn(wagmi, 'useWriteContract');
    const readContractSpy = jest.spyOn(wagmiActions, 'readContract');
    const waitForReceiptSpy = jest.spyOn(
        wagmiActions,
        'waitForTransactionReceipt',
    );
    const logErrorSpy = jest.spyOn(monitoringUtils, 'logError');

    const writeContractAsync = jest.fn();
    const refetchCredit = jest.fn();

    beforeEach(() => {
        useWalletAccountSpy.mockReturnValue({
            address: '0xabc0000000000000000000000000000000000001',
        } as never);
        useDaoChainSpy.mockReturnValue({ chainId: 11_155_111 } as never);
        useTokenSpy.mockReturnValue({
            data: { decimals: 6, symbol: 'USDC' },
            isLoading: false,
        } as never);
        useReadContractSpy.mockImplementation(
            (parameters) =>
                (parameters?.functionName === 'interfoldFeeToken'
                    ? { data: feeToken, isLoading: false }
                    : {
                          data: BigInt(0),
                          isLoading: false,
                          refetch: refetchCredit,
                      }) as never,
        );
        useReadContractsSpy.mockReturnValue({
            data: [{ status: 'success', result: BigInt(100) }],
            isLoading: false,
        } as never);
        useWriteContractSpy.mockReturnValue({ writeContractAsync } as never);
        // Enough balance and allowance: the deposit is the only transaction
        readContractSpy.mockResolvedValue(BigInt(1000) as never);
        writeContractAsync.mockResolvedValue('0xdead');
        logErrorSpy.mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    const deposit = async () => {
        const { result } = renderHook(() =>
            useCrispFeeCredits({
                network: Network.ETHEREUM_SEPOLIA,
                pluginAddress,
                quoteCalls,
            }),
        );

        let deposited: boolean | undefined;
        await act(async () => {
            deposited = await result.current.depositShortfall();
        });

        return { deposited, depositFailure: result.current.depositFailure };
    };

    it('deposits the shortfall and refreshes the credit', async () => {
        waitForReceiptSpy.mockResolvedValue({ status: 'success' } as never);

        const { deposited, depositFailure } = await deposit();

        expect(deposited).toBeTruthy();
        expect(depositFailure).toBeUndefined();
        expect(refetchCredit).toHaveBeenCalled();
    });

    it('fails when the deposit is mined but reverted', async () => {
        waitForReceiptSpy.mockResolvedValue({ status: 'reverted' } as never);

        const { deposited, depositFailure } = await deposit();

        expect(deposited).toBeFalsy();
        expect(depositFailure).toEqual('transaction');
    });

    it('reports a signature declined in the wallet without logging it', async () => {
        writeContractAsync.mockRejectedValue(
            new UserRejectedRequestError(new Error('User denied')),
        );

        const { deposited, depositFailure } = await deposit();

        expect(deposited).toBeFalsy();
        expect(depositFailure).toEqual('rejected');
        expect(logErrorSpy).not.toHaveBeenCalled();
    });

    it('does not claim nothing was deposited when a sent deposit cannot be confirmed', async () => {
        const error = new Error('receipt timeout');
        waitForReceiptSpy.mockRejectedValue(error);

        const { deposited, depositFailure } = await deposit();

        expect(deposited).toBeFalsy();
        expect(depositFailure).toEqual('unconfirmed');
        expect(logErrorSpy).toHaveBeenCalledWith(error, {
            context: { plugin: pluginAddress, depositHash: '0xdead' },
        });
    });
});
