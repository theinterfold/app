import { useQuery } from '@tanstack/react-query';
import type { QueryOptions, SharedQueryOptions } from '@/shared/types';
import { crispService } from '../../crispService';
import type { ICrispRoundParams } from '../../crispService.api';
import { crispServiceKeys } from '../../crispServiceKeys';
import type { ICrispRoundState } from '../../domain';

export const crispRoundStateOptions = (
    params: ICrispRoundParams,
    options?: QueryOptions<ICrispRoundState>,
): SharedQueryOptions<ICrispRoundState> => ({
    queryKey: crispServiceKeys.roundState(params),
    queryFn: () => crispService.getRoundState(params),
    ...options,
});

export const useCrispRoundState = (
    params: ICrispRoundParams,
    options?: QueryOptions<ICrispRoundState>,
) => useQuery(crispRoundStateOptions(params, options));
