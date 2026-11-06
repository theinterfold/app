import type { Hex } from 'viem';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '@/modules/application/constants/wagmi';
import {
    crispInterfoldAbi,
    crispRefundManagerAbi,
    crispSlashingManagerAbi,
} from '../../constants/crispInterfoldAbi';
import {
    type CrispE3FailureReason,
    CrispE3Stage,
    type ICrispProposal,
} from '../../types';
import { crispPluginAbi } from '../crispTransactionUtils/crispPluginAbi';

// Transactions leading from a failed round to a refunded credit, in order
export type CrispRefundStep = 'markFailed' | 'processFailure' | 'claim';

// Why the next step would still revert
export type CrispRefundWaitReason =
    | 'graceRunning'
    | 'reportingRunning'
    | 'reportsOpen';

export interface ICrispRefundWait {
    /**
     * Window that blocks the next step.
     */
    reason: CrispRefundWaitReason;
    /**
     * When the window ends, in milliseconds. Undefined when it ends once the open reports are
     * resolved.
     */
    until?: number;
}

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
    /**
     * Whether the failure of the round can be processed. The coordinator blocks it while a member
     * of the committee can still be reported or a report against one is open.
     */
    isSettlementOpen: boolean;
    /**
     * When the window to report a member of the committee closes, in seconds. Only read while the
     * failure is not processed.
     */
    reportingDeadline?: number;
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

        const settlement =
            stage === CrispE3Stage.FAILED && !distribution.calculated
                ? await this.fetchSettlement({
                      chainId,
                      refundManager,
                      e3Id,
                  })
                : { isSettlementOpen: true };

        return {
            payer,
            interfold,
            stage,
            markFailedGracePeriod: Number(markFailedGracePeriod),
            isCalculated: distribution.calculated,
            amount: distribution.requesterAmount,
            isClaimed,
            ...settlement,
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

    // Undefined when the step can be sent now. The coordinator reverts the step during the window,
    // so the payer is told when it ends instead of being offered the call.
    getRefundWait = (
        proposal: ICrispProposal,
        state: ICrispRefundState,
        step: CrispRefundStep | undefined,
        now: number = Date.now(),
    ): ICrispRefundWait | undefined => {
        if (step === 'markFailed') {
            const start = this.getMarkFailedStart(proposal, state);

            return start != null && start > now
                ? { reason: 'graceRunning', until: start }
                : undefined;
        }

        if (step !== 'processFailure' || state.isSettlementOpen) {
            return undefined;
        }

        const reportingEnd =
            state.reportingDeadline == null
                ? undefined
                : state.reportingDeadline * 1000;

        // Past the deadline the window only stays closed while a report is open
        return reportingEnd != null && reportingEnd > now
            ? { reason: 'reportingRunning', until: reportingEnd }
            : { reason: 'reportsOpen' };
    };

    // The refund manager settles a round through the slashing manager frozen at its request
    private fetchSettlement = async (params: {
        chainId: number;
        refundManager: Hex;
        e3Id: bigint;
    }): Promise<
        Pick<ICrispRefundState, 'isSettlementOpen' | 'reportingDeadline'>
    > => {
        const { chainId, refundManager, e3Id } = params;

        const { slashingManager } = await readContract(wagmiConfig, {
            chainId,
            address: refundManager,
            abi: crispRefundManagerAbi,
            functionName: 'getE3PolicySnapshot',
            args: [e3Id],
        });

        const [isSettlementOpen, reportingDeadline] = await Promise.all([
            readContract(wagmiConfig, {
                chainId,
                address: slashingManager,
                abi: crispSlashingManagerAbi,
                functionName: 'settlementOpen',
                args: [e3Id],
            }),
            readContract(wagmiConfig, {
                chainId,
                address: slashingManager,
                abi: crispSlashingManagerAbi,
                functionName: 'accusationSubmissionDeadline',
                args: [e3Id],
            }),
        ]);

        return {
            isSettlementOpen,
            reportingDeadline:
                reportingDeadline === BigInt(0)
                    ? undefined
                    : Number(reportingDeadline),
        };
    };
}

export const crispRefundUtils = new CrispRefundUtils();
