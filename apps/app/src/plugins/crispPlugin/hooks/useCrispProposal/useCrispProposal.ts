'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { GovernanceServiceKey } from '@/modules/governance/api/governanceService';
import type { ICrispProposal } from '../../types';
import { crispProposalResolverUtils } from '../../utils/crispProposalResolverUtils';

const crispProposalPollInterval = 15_000;

export interface IUseCrispProposalParams<
    TProposal extends ICrispProposal | undefined,
> {
    /**
     * Proposal as returned by the backend, its CRISP-specific fields are resolved on-chain.
     */
    proposal: TProposal;
}

export interface IUseCrispProposalResult<
    TProposal extends ICrispProposal | undefined,
> {
    /**
     * Proposal with its CRISP-specific state resolved, or the backend proposal while the on-chain
     * reads are in flight or unavailable.
     */
    proposal: TProposal;
    /**
     * Defines if the on-chain state is still being fetched.
     */
    isLoading: boolean;
}

/**
 * Resolves the on-chain state of a CRISP proposal (thresholds, tally, round divisor and failure)
 * and polls it until it is settled. The indexed proposal queries are invalidated when it changes,
 * so the status resolved by the governance service follows.
 */
export const useCrispProposal = <TProposal extends ICrispProposal | undefined>(
    params: IUseCrispProposalParams<TProposal>,
): IUseCrispProposalResult<TProposal> => {
    const { proposal } = params;

    const queryClient = useQueryClient();

    const { data: chainState, isLoading } = useQuery({
        queryKey: [
            'crisp',
            'proposal',
            proposal?.network,
            proposal?.pluginAddress.toLowerCase(),
            proposal?.proposalIndex,
        ],
        queryFn: () =>
            crispProposalResolverUtils.fetchChainState({
                network: proposal!.network,
                pluginAddress: proposal!.pluginAddress,
                proposalIndex: proposal!.proposalIndex,
            }),
        enabled: proposal != null,
        refetchInterval: ({ state }) =>
            state.data != null &&
            crispProposalResolverUtils.isSettled(state.data)
                ? false
                : crispProposalPollInterval,
    });

    const processedProposal = useMemo((): TProposal => {
        if (proposal == null || chainState == null) {
            return proposal;
        }

        return crispProposalResolverUtils.mergeChainState(
            proposal,
            chainState,
        ) as TProposal;
    }, [chainState, proposal]);

    const stateKey =
        chainState != null
            ? `${chainState.proposal.executed}-${chainState.failureReason}-${chainState.liveCounts?.length}`
            : undefined;
    const previousStateKey = useRef(stateKey);

    useEffect(() => {
        if (
            previousStateKey.current != null &&
            previousStateKey.current !== stateKey
        ) {
            void queryClient.invalidateQueries({
                queryKey: [GovernanceServiceKey.PROPOSAL_BY_SLUG],
            });
        }

        previousStateKey.current = stateKey;
    }, [stateKey, queryClient]);

    return { proposal: processedProposal, isLoading };
};
