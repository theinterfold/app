import type { Hex } from 'viem';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '@/modules/application/constants/wagmi';
import {
    crispE3StageFailed,
    crispInterfoldAbi,
    crispRefundManagerAbi,
} from '../../constants/crispInterfoldAbi';
import { crispPluginAbi } from '../crispTransactionUtils/crispPluginAbi';

// Transactions leading from a failed round to a refunded credit, in order
export type CrispRefundStep = 'markFailed' | 'processFailure' | 'claim';

export interface ICrispRefundState {
    /**
     * Account whose fee credit receives the refund.
     */
    payer: Hex;
    /**
     * Coordinator of the round.
     */
    interfold: Hex;
    /**
     * `IInterfold.E3Stage` of the round.
     */
    stage: number;
    /**
     * Whether the refund manager has calculated the refund of the round.
     */
    isCalculated: boolean;
    /**
     * Fee-token amount that can be claimed.
     */
    amount: bigint;
    /**
     * Whether the refund was already claimed.
     */
    isClaimed: boolean;
}

export interface IFetchCrispRefundStateParams {
    chainId: number;
    pluginAddress: Hex;
    proposalId: bigint;
    e3Id: bigint;
}

class CrispRefundUtils {
    fetchRefundState = async (
        params: IFetchCrispRefundStateParams,
    ): Promise<ICrispRefundState> => {
        const { chainId, pluginAddress, proposalId, e3Id } = params;

        const [payer, interfold] = await Promise.all([
            readContract(wagmiConfig, {
                chainId,
                address: pluginAddress,
                abi: crispPluginAbi,
                functionName: 'proposalPayer',
                args: [proposalId],
            }),
            readContract(wagmiConfig, {
                chainId,
                address: pluginAddress,
                abi: crispPluginAbi,
                functionName: 'interfold',
            }),
        ]);

        const [stage, refundManager] = await Promise.all([
            readContract(wagmiConfig, {
                chainId,
                address: interfold,
                abi: crispInterfoldAbi,
                functionName: 'getE3Stage',
                args: [e3Id],
            }),
            readContract(wagmiConfig, {
                chainId,
                address: interfold,
                abi: crispInterfoldAbi,
                functionName: 'e3RefundManager',
            }),
        ]);

        const [distribution, isClaimed] = await Promise.all([
            readContract(wagmiConfig, {
                chainId,
                address: refundManager,
                abi: crispRefundManagerAbi,
                functionName: 'getRefundDistribution',
                args: [e3Id],
            }),
            readContract(wagmiConfig, {
                chainId,
                address: refundManager,
                abi: crispRefundManagerAbi,
                functionName: 'hasRequesterClaimed',
                args: [e3Id, pluginAddress],
            }),
        ]);

        return {
            payer,
            interfold,
            stage,
            isCalculated: distribution.calculated,
            amount: distribution.requesterAmount,
            isClaimed,
        };
    };

    // Undefined when there is nothing left to do (already claimed or nothing to refund)
    getRefundStep = (state: ICrispRefundState): CrispRefundStep | undefined => {
        const { stage, isCalculated, amount, isClaimed } = state;

        if (isClaimed) {
            return undefined;
        }

        if (stage !== crispE3StageFailed) {
            return 'markFailed';
        }

        if (!isCalculated) {
            return 'processFailure';
        }

        return amount > BigInt(0) ? 'claim' : undefined;
    };
}

export const crispRefundUtils = new CrispRefundUtils();
