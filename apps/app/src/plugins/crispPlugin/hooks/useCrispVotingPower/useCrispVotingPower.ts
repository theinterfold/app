'use client';

import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';
import type { ICrispProposal } from '../../types';
import {
    crispRoundUtils,
    type ICrispVotingPower,
} from '../../utils/crispRoundUtils';

export interface IUseCrispVotingPowerParams {
    /**
     * Proposal whose round the voting power is read for, with its `e3Id` resolved.
     */
    proposal?: ICrispProposal;
    /**
     * Address of the voter, which is also the slot its ballot is written to.
     */
    address?: string;
}

export interface IUseCrispVotingPowerResult {
    /**
     * Voting power of the address in the round, undefined until it is read.
     */
    votingPower?: ICrispVotingPower;
    /**
     * Defines if the voting power is still being read.
     */
    isLoading: boolean;
    /**
     * Reads the voting power again.
     */
    refetch: () => Promise<unknown>;
}

/**
 * Reads the voting power an address holds in the round of a proposal. The CRISP program reads it
 * from the token at the snapshot of the round, so the current balance of the voter is not
 * consulted: a member who acquired tokens after the round opened cannot vote in it.
 */
export const useCrispVotingPower = (
    params: IUseCrispVotingPowerParams,
): IUseCrispVotingPowerResult => {
    const { proposal, address } = params;

    const e3Id = proposal?.e3Id;

    const { data, isLoading, refetch } = useQuery({
        queryKey: [
            'crisp',
            'votingPower',
            proposal?.network,
            proposal?.pluginAddress,
            e3Id,
            address,
        ],
        queryFn: async () => {
            const { network, pluginAddress, settings } = proposal!;

            const { programAddress } = await crispRoundUtils.readE3Record({
                network,
                pluginAddress: pluginAddress as Hex,
                e3Id: BigInt(e3Id!),
            });

            return crispRoundUtils.readVotingPower({
                network,
                programAddress,
                tokenAddress: settings.token.address as Hex,
                e3Id: BigInt(e3Id!),
                slot: address as Hex,
            });
        },
        enabled:
            proposal != null && e3Id != null && e3Id !== '' && address != null,
    });

    return { votingPower: data, isLoading, refetch };
};
