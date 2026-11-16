'use client';

import { invariant } from '@aragon/gov-ui-kit';
import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import { useDaoChain } from '@/shared/hooks/useDaoChain';
import type { ICrispProposal } from '../../types';
import { crispRefundUtils } from '../../utils/crispRefundUtils';

export interface IUseCrispRefundParams {
    /**
     * Proposal whose round failed. Nothing is read for any other proposal.
     */
    proposal: ICrispProposal;
}

/**
 * Reads where the refund of a failed round stands and who it is credited to.
 */
export const useCrispRefund = (params: IUseCrispRefundParams) => {
    const { proposal } = params;
    const { network, pluginAddress, proposalIndex, e3Id, failureReason } =
        proposal;

    const { address } = useWalletAccount();
    const { chainId } = useDaoChain({ network });

    const { data: state, refetch } = useQuery({
        queryKey: [
            'crisp',
            'refund',
            network,
            pluginAddress.toLowerCase(),
            proposalIndex,
        ],
        queryFn: () => {
            invariant(
                chainId != null && e3Id != null && e3Id !== '',
                'useCrispRefund: the chain or the round of the proposal is not known.',
            );

            return crispRefundUtils.fetchRefundState({
                chainId,
                pluginAddress: pluginAddress as Hex,
                proposalId: BigInt(proposalIndex),
                e3Id: BigInt(e3Id),
            });
        },
        enabled:
            failureReason != null &&
            chainId != null &&
            e3Id != null &&
            e3Id !== '',
    });

    return {
        state,
        step: state != null ? crispRefundUtils.getRefundStep(state) : undefined,
        isPayer:
            address != null &&
            state?.payer.toLowerCase() === address.toLowerCase(),
        refetch,
    };
};
