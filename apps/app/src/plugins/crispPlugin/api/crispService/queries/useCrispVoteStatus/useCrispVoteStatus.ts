import { useQuery } from '@tanstack/react-query';
import type { QueryOptions, SharedQueryOptions } from '@/shared/types';
import { crispService } from '../../crispService';
import type { ICrispVoteStatusParams } from '../../crispService.api';
import { crispServiceKeys } from '../../crispServiceKeys';
import type { ICrispVoteStatus } from '../../domain';

export const crispVoteStatusOptions = (
    params: ICrispVoteStatusParams,
    options?: QueryOptions<ICrispVoteStatus>,
): SharedQueryOptions<ICrispVoteStatus> => ({
    queryKey: crispServiceKeys.voteStatus(params),
    queryFn: () => crispService.getVoteStatus(params),
    ...options,
});

export const useCrispVoteStatus = (
    params: ICrispVoteStatusParams,
    options?: QueryOptions<ICrispVoteStatus>,
) => useQuery(crispVoteStatusOptions(params, options));
