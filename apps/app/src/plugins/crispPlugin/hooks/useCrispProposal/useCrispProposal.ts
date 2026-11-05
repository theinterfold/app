'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { Hex } from 'viem';
import {
    GovernanceServiceKey,
    useProposalBySlug,
} from '@/modules/governance/api/governanceService';
import { proposalUtils } from '@/modules/governance/utils/proposalUtils';
import { useDao } from '@/shared/api/daoService';
import { useDaoChain } from '@/shared/hooks/useDaoChain';
import type { ICrispProposal } from '../../types';
import { crispProposalUtils } from '../../utils/crispProposalUtils';
import { crispRefundUtils } from '../../utils/crispRefundUtils';

const crispProposalPollInterval = 15_000;

export interface IUseCrispProposalParams<
    TProposal extends ICrispProposal | undefined,
> {
    /**
     * Proposal as returned by the backend.
     */
    proposal: TProposal;
}

export interface IUseCrispProposalResult<
    TProposal extends ICrispProposal | undefined,
> {
    /**
     * Latest proposal served by the backend, or the given proposal when it is settled or the
     * backend has not answered yet. Its `failureReason` is set when the round missed a deadline
     * that nobody marked yet.
     */
    proposal: TProposal;
    /**
     * Defines if the latest proposal is still being fetched.
     */
    isLoading: boolean;
}

/**
 * Polls the backend proposal until it is settled (executed, failed or tally published), as the
 * backend indexes the round of a CRISP proposal while it goes. The indexed proposal queries are
 * invalidated once the polled proposal settles, so the status resolved by the governance service
 * follows.
 *
 * A round whose deadline passed emits no event until someone marks it as failed, so while the
 * proposal is unsettled the coordinator is also asked whether the round can be marked, which
 * lets the refund start.
 */
export const useCrispProposal = <TProposal extends ICrispProposal | undefined>(
    params: IUseCrispProposalParams<TProposal>,
): IUseCrispProposalResult<TProposal> => {
    const { proposal } = params;

    const queryClient = useQueryClient();

    const daoId =
        proposal != null ? `${proposal.network}-${proposal.daoAddress}` : '';
    const { data: dao } = useDao(
        { urlParams: { id: daoId } },
        { enabled: proposal != null },
    );

    const slug =
        proposal != null
            ? proposalUtils.getProposalSlug(proposal, dao)
            : undefined;
    const isProposalSettled =
        proposal == null || crispProposalUtils.isSettled(proposal);

    const { data: latestProposal, isLoading } =
        useProposalBySlug<ICrispProposal>(
            { urlParams: { slug: slug ?? '' }, queryParams: { daoId } },
            {
                enabled: slug != null && !isProposalSettled,
                refetchInterval: ({ state }) =>
                    state.data != null &&
                    crispProposalUtils.isSettled(state.data)
                        ? false
                        : crispProposalPollInterval,
            },
        );

    const isLatestSettled =
        latestProposal != null && crispProposalUtils.isSettled(latestProposal);

    useEffect(() => {
        if (isLatestSettled && !isProposalSettled) {
            void queryClient.invalidateQueries({
                queryKey: [GovernanceServiceKey.PROPOSAL_BY_SLUG],
            });
        }
    }, [isLatestSettled, isProposalSettled, queryClient]);

    const indexedProposal = useMemo(
        (): TProposal =>
            proposal != null && latestProposal != null && !isProposalSettled
                ? ({ ...proposal, ...latestProposal } as TProposal)
                : proposal,
        [proposal, latestProposal, isProposalSettled],
    );

    const { chainId } = useDaoChain({ network: proposal?.network });
    const isIndexedSettled =
        indexedProposal == null ||
        crispProposalUtils.isSettled(indexedProposal);

    const { data: unmarkedFailureReason } = useQuery({
        queryKey: [
            'crisp',
            'failure-condition',
            proposal?.network,
            proposal?.pluginAddress.toLowerCase(),
            proposal?.e3Id,
        ],
        queryFn: () =>
            crispRefundUtils.fetchFailureCondition({
                chainId: chainId!,
                pluginAddress: proposal!.pluginAddress as Hex,
                e3Id: BigInt(proposal!.e3Id),
            }),
        enabled: !isIndexedSettled && chainId != null,
        refetchInterval: ({ state }) =>
            state.data != null ? false : crispProposalPollInterval,
    });

    const processedProposal = useMemo(
        (): TProposal =>
            indexedProposal != null &&
            !isIndexedSettled &&
            unmarkedFailureReason != null
                ? ({
                      ...indexedProposal,
                      failureReason: unmarkedFailureReason,
                  } as TProposal)
                : indexedProposal,
        [indexedProposal, isIndexedSettled, unmarkedFailureReason],
    );

    return { proposal: processedProposal, isLoading };
};
