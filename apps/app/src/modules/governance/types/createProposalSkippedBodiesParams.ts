import type { TransactionReceipt } from 'viem';
import type { IDaoPlugin } from '@/shared/api/daoService';

export interface ICreateProposalSkippedBodiesParams {
    /**
     * Plugin the proposal was created on.
     */
    plugin: IDaoPlugin;
    /**
     * Receipt of the proposal creation transaction.
     */
    receipt: TransactionReceipt;
}
