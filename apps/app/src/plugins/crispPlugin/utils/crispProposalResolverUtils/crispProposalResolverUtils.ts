import {
    type Abi,
    type ContractFunctionArgs,
    type ContractFunctionName,
    type ContractFunctionReturnType,
    createPublicClient,
    type Hex,
    http,
} from 'viem';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '@/modules/application/constants/wagmi';
import type { IProposal } from '@/modules/governance/api/governanceService';
import type { ITokenProposalOptionVotes } from '@/plugins/tokenPlugin/types';
import type { Network } from '@/shared/api/daoService';
import { networkDefinitions } from '@/shared/constants/networkDefinitions';
import {
    crispE3StageFailed,
    crispInterfoldAbi,
} from '../../constants/crispInterfoldAbi';
import { crispProgramAbi } from '../../constants/crispProgramAbi';
import { CrispE3FailureReason, type ICrispProposal } from '../../types';
import { crispPluginAbi } from '../crispTransactionUtils/crispPluginAbi';
import { crispVoteUtils } from '../crispVoteUtils';

export type ICrispOnChainProposal = ContractFunctionReturnType<
    typeof crispPluginAbi,
    'view',
    'getProposal'
>;

export interface ICrispProposalChainState {
    /**
     * Parameters frozen at creation, the stored tally (all zeroes until the proposal is executed)
     * and the executed flag.
     */
    proposal: ICrispOnChainProposal;
    /**
     * Tally decoded from the E3 output. Undefined when it is not published yet (`getTally`
     * reverts) or the read failed.
     */
    liveCounts?: readonly bigint[];
    /**
     * Quorum denominator in raw token units.
     */
    totalVotingPower?: bigint;
    /**
     * Raw token units one tally count stands for, read from the CRISP program of the round.
     */
    divisor?: bigint;
    /**
     * Why the round failed, undefined while it has not.
     */
    failureReason?: CrispE3FailureReason;
}

export interface IFetchCrispProposalStateParams {
    network: Network;
    /**
     * Address of the CrispVoting plugin.
     */
    pluginAddress: string;
    /**
     * Proposal index, the contract's proposal id.
     */
    proposalIndex: string;
}

type ICrispReader = <
    const TAbi extends Abi,
    TFunctionName extends ContractFunctionName<TAbi, 'pure' | 'view'>,
>(params: {
    address: Hex;
    abi: TAbi;
    functionName: TFunctionName;
    args?: ContractFunctionArgs<TAbi, 'pure' | 'view', TFunctionName>;
}) => Promise<ContractFunctionReturnType<TAbi, 'pure' | 'view', TFunctionName>>;

// Reads fired in the same tick are folded into a multicall by the viem client
const buildClientReader =
    (network: Network): ICrispReader =>
    (params) =>
        readContract(wagmiConfig, {
            ...params,
            chainId: networkDefinitions[network].id,
        } as never) as never;

const buildServerReader = async (network: Network): Promise<ICrispReader> => {
    // Dynamic import to keep the module resolving the secret RPC URL out of the client chunk
    const { resolveServerRpcUrl } = await import(
        '@/modules/application/utils/proxyRpcUtils/resolveServerRpcUrl'
    );
    const rpcUrl = resolveServerRpcUrl(network);

    if (rpcUrl == null) {
        throw new Error(
            `CrispProposalResolver: no server-side RPC endpoint configured for network ${network}`,
        );
    }

    const client = createPublicClient({
        chain: networkDefinitions[network],
        transport: http(rpcUrl),
        batch: { multicall: true },
    });

    return (params) => client.readContract(params as never) as never;
};

// Same server / client split as fetchTokensTotalSupply (NEXT_RUNTIME is folded at build time)
const getReader = (network: Network): Promise<ICrispReader> | ICrispReader =>
    process.env.NEXT_RUNTIME === 'nodejs'
        ? buildServerReader(network)
        : buildClientReader(network);

// A failed secondary read leaves the field undefined, the proposal then renders as unresolved
const optional = <T>(read?: Promise<T>): Promise<T | undefined> =>
    read?.catch(() => undefined) ?? Promise.resolve(undefined);

class CrispProposalResolverUtils {
    // Only a failed `getProposal` rejects
    fetchChainState = async (
        params: IFetchCrispProposalStateParams,
    ): Promise<ICrispProposalChainState> => {
        const { network, pluginAddress, proposalIndex } = params;

        const read = await getReader(network);
        const address = pluginAddress as Hex;
        const proposalId = BigInt(proposalIndex);

        const [proposal, liveTally, interfold] = await Promise.all([
            read({
                address,
                abi: crispPluginAbi,
                functionName: 'getProposal',
                args: [proposalId],
            }),
            optional(
                read({
                    address,
                    abi: crispPluginAbi,
                    functionName: 'getTally',
                    args: [proposalId],
                }),
            ),
            optional(
                read({
                    address,
                    abi: crispPluginAbi,
                    functionName: 'interfold',
                }),
            ),
        ]);

        const { e3Id, parameters } = proposal;

        const readInterfold = <T>(call: (interfold: Hex) => Promise<T>) =>
            interfold != null ? optional(call(interfold)) : optional<T>();

        const [totalVotingPower, e3, stage, storedReason, condition] =
            await Promise.all([
                optional(
                    read({
                        address,
                        abi: crispPluginAbi,
                        functionName: 'totalVotingPower',
                        args: [parameters.snapshotBlock],
                    }),
                ),
                readInterfold((address) =>
                    read({
                        address,
                        abi: crispInterfoldAbi,
                        functionName: 'getE3',
                        args: [e3Id],
                    }),
                ),
                readInterfold((address) =>
                    read({
                        address,
                        abi: crispInterfoldAbi,
                        functionName: 'getE3Stage',
                        args: [e3Id],
                    }),
                ),
                readInterfold((address) =>
                    read({
                        address,
                        abi: crispInterfoldAbi,
                        functionName: 'getFailureReason',
                        args: [e3Id],
                    }),
                ),
                readInterfold((address) =>
                    read({
                        address,
                        abi: crispInterfoldAbi,
                        functionName: 'checkFailureCondition',
                        args: [e3Id],
                    }),
                ),
            ]);

        const divisor =
            e3 != null
                ? await optional(
                      read({
                          address: e3.e3Program,
                          abi: crispProgramAbi,
                          functionName: 'votingPowerDivisorOf',
                          args: [e3Id],
                      }),
                  )
                : undefined;

        return {
            proposal,
            liveCounts: liveTally?.counts,
            totalVotingPower,
            divisor,
            failureReason: this.getFailureReason(
                stage,
                storedReason,
                condition,
            ),
        };
    };

    // Never rejects, a failed read hands back the envelope which renders as an unresolved proposal
    resolveProposal = async <TProposal extends IProposal>(
        proposal: TProposal,
    ): Promise<TProposal> => {
        try {
            const state = await this.fetchChainState({
                network: proposal.network,
                pluginAddress: proposal.pluginAddress,
                proposalIndex: proposal.proposalIndex,
            });

            return this.mergeChainState(
                proposal as unknown as ICrispProposal,
                state,
            ) as unknown as TProposal;
        } catch {
            return proposal;
        }
    };

    // A round fails once the coordinator marked it as failed, or once a deadline passed that
    // nobody has marked yet (the round can then only be marked, never progress)
    getFailureReason = (
        stage?: number,
        storedReason?: number,
        condition?: readonly [boolean, number],
    ): CrispE3FailureReason | undefined => {
        if (stage === crispE3StageFailed) {
            return storedReason ?? CrispE3FailureReason.NONE;
        }

        return condition?.[0] ? condition[1] : undefined;
    };

    // Nothing left to wait for: the proposal was executed, its round failed or the tally is published
    isSettled = (state: ICrispProposalChainState): boolean =>
        state.proposal.executed ||
        state.failureReason != null ||
        (state.liveCounts?.length ?? 0) > 0;

    /**
     * Merges the chain state into the backend envelope, the contract being authoritative for the
     * settings, the tally and the execution. The stored tally of a proposal that is not executed
     * is `[0, 0, 0]` and not a published tally, so the live `getTally` is used until then.
     */
    mergeChainState = (
        proposal: ICrispProposal,
        state: ICrispProposalChainState,
    ): ICrispProposal => {
        const { proposal: onChain, liveCounts, totalVotingPower } = state;
        const { parameters, e3Id, tally } = onChain;

        // Not created by this plugin (stale index)
        if (parameters.snapshotBlock === BigInt(0)) {
            return proposal;
        }

        const counts = onChain.executed ? tally.counts : liveCounts;
        const isTallyPublished = counts != null && counts.length > 0;
        const divisor =
            state.divisor != null && state.divisor > BigInt(0)
                ? state.divisor
                : undefined;

        return {
            ...proposal,
            e3Id: e3Id.toString(),
            isTallyPublished,
            failureReason: state.failureReason,
            votingPowerDivisor: divisor?.toString(),
            // The index lags the execution event
            executed: onChain.executed
                ? { ...proposal.executed, status: true }
                : proposal.executed,
            metrics: {
                ...proposal.metrics,
                votesByOption:
                    counts != null && divisor != null
                        ? this.buildVotesByOption(counts, divisor)
                        : [],
            },
            settings: {
                ...proposal.settings,
                minParticipation: Number(parameters.minParticipation),
                supportThreshold: Number(parameters.supportThreshold),
                minVoterVotingPower: parameters.minVotingPower.toString(),
                historicalTotalSupply:
                    totalVotingPower?.toString() ??
                    proposal.settings.historicalTotalSupply,
            },
        };
    };

    // The tally counts are in units of the round divisor, they are converted to raw token units
    // as expected by the components
    private buildVotesByOption = (
        counts: readonly bigint[],
        divisor: bigint,
    ): ITokenProposalOptionVotes[] =>
        counts.reduce<ITokenProposalOptionVotes[]>((current, count, index) => {
            const type = crispVoteUtils.toVoteOption(index);

            return type == null
                ? current
                : current.concat({
                      type,
                      totalVotingPower: (count * divisor).toString(),
                  });
        }, []);
}

export const crispProposalResolverUtils = new CrispProposalResolverUtils();
