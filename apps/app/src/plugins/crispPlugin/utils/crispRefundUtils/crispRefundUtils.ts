import type { Hex } from 'viem';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '@/modules/application/constants/wagmi';
import {
    crispInterfoldAbi,
    crispRefundManagerAbi,
} from '../../constants/crispInterfoldAbi';
import {
    type CrispE3FailureReason,
    CrispE3Stage,
    type ICrispProposal,
} from '../../types';
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
     * Stage of the round.
     */
    stage: CrispE3Stage;
    /**
     * Seconds after a missed deadline during which only the requester, the coordinator owner and
     * the committee may mark the round failed.
     */
    markFailedGracePeriod: number;
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

export type IFetchCrispFailureConditionParams = Omit<
    IFetchCrispRefundStateParams,
    'proposalId'
>;

class CrispRefundUtils {
    // A round whose deadline passed without anyone marking it emits no event, so the indexed
    // proposal does not report it as failed. Null while the round has not missed a deadline.
    fetchFailureCondition = async (
        params: IFetchCrispFailureConditionParams,
    ): Promise<CrispE3FailureReason | null> => {
        const { chainId, pluginAddress, e3Id } = params;

        const interfold = await readContract(wagmiConfig, {
            chainId,
            address: pluginAddress,
            abi: crispPluginAbi,
            functionName: 'interfold',
        });

        const [canFail, reason] = await readContract(wagmiConfig, {
            chainId,
            address: interfold,
            abi: crispInterfoldAbi,
            functionName: 'checkFailureCondition',
            args: [e3Id],
        });

        return canFail ? reason : null;
    };

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

        const [stage, refundManager, markFailedGracePeriod] = await Promise.all(
            [
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
                readContract(wagmiConfig, {
                    chainId,
                    address: interfold,
                    abi: crispInterfoldAbi,
                    functionName: 'markFailedGracePeriod',
                }),
            ],
        );

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
            markFailedGracePeriod: Number(markFailedGracePeriod),
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

        if (stage !== CrispE3Stage.FAILED) {
            return 'markFailed';
        }

        if (!isCalculated) {
            return 'processFailure';
        }

        return amount > BigInt(0) ? 'claim' : undefined;
    };

    // When anyone may mark the round failed, in milliseconds: the coordinator reserves the grace
    // period after the missed deadline to the requester, its owner and the committee. Undefined
    // when the backend has not read the deadline, the call is then left to the coordinator.
    getMarkFailedStart = (
        proposal: ICrispProposal,
        state: ICrispRefundState,
    ): number | undefined =>
        proposal.e3StageDeadline == null
            ? undefined
            : (proposal.e3StageDeadline + state.markFailedGracePeriod) * 1000;
}

export const crispRefundUtils = new CrispRefundUtils();
