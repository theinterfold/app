'use client';

import type { Network } from '@/shared/api/daoService';
import {
    type ICrispRoundState,
    useCrispRoundState,
} from '../../api/crispService';

const roundStatePollInterval = 10_000;

export interface IUseCrispRoundParams {
    /**
     * Network of the round.
     */
    network: Network;
    /**
     * E3 id of the round, empty until the proposal is resolved on-chain.
     */
    e3Id?: string;
    /**
     * Defines if the round is read.
     * @default true
     */
    enabled?: boolean;
}

export interface IUseCrispRoundResult {
    /**
     * State of the round served by the CRISP server.
     */
    roundState?: ICrispRoundState;
    /**
     * Error of the last read of the round, the server answers 404 until the round is known.
     */
    roundError?: Error;
    /**
     * Defines if the round accepts ballots: it is active and its committee published its key.
     */
    isRoundReady: boolean;
    /**
     * Defines if the round state is being fetched for the first time.
     */
    isLoading: boolean;
}

// A round is requested, then active until its deadline, then expired and computing until its result
// is published. Only the first two can still become ready to accept ballots.
const roundOpeningStatuses = ['Requested', 'Active'];

const isRoundOpen = (round?: ICrispRoundState) =>
    round?.status === 'Active' && round.committee_public_key.length > 0;

const hasRoundLeftOpening = (round?: ICrispRoundState) =>
    round != null && !roundOpeningStatuses.includes(round.status);

/**
 * Reads the state of a CRISP round. The committee publishes its key some way into the round, after
 * its key generation, so the round is polled until it accepts ballots, or until it left the stages
 * in which it could.
 */
export const useCrispRound = (
    params: IUseCrispRoundParams,
): IUseCrispRoundResult => {
    const { network, e3Id, enabled = true } = params;

    const hasRound = e3Id != null && e3Id !== '';

    const { data, error, isLoading } = useCrispRoundState(
        { network, e3Id: e3Id ?? '' },
        {
            enabled: enabled && hasRound,
            refetchInterval: (query) =>
                isRoundOpen(query.state.data) ||
                hasRoundLeftOpening(query.state.data)
                    ? false
                    : roundStatePollInterval,
        },
    );

    return {
        roundState: data,
        roundError: error ?? undefined,
        isRoundReady: isRoundOpen(data),
        isLoading,
    };
};
