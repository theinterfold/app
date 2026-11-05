import { type Hex, isAddressEqual } from 'viem';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '@/modules/application/constants/wagmi';
import type { Network } from '@/shared/api/daoService';
import { networkDefinitions } from '@/shared/constants/networkDefinitions';
import { crispE3Config } from '../../constants/crispE3Config';
import { crispInterfoldAbi } from '../../constants/crispInterfoldAbi';
import { crispProgramAbi } from '../../constants/crispProgramAbi';
import { crispVotesTokenAbi } from '../../constants/crispVotesTokenAbi';
import { CrispError } from '../../types';
import { crispPluginAbi } from '../crispTransactionUtils/crispPluginAbi';

// `CRISPProgram.CensusMode.ONCHAIN`: the program reads the voting power of each voter from the
// token, so no census is built. It is the only mode CRISP proposals are requested with.
const onchainCensusMode = 2;

export interface ICrispE3Record {
    /**
     * Interfold coordinator the E3 was requested from.
     */
    interfoldAddress: Hex;
    /**
     * CRISP program the round runs, which verifies its ballots.
     */
    programAddress: Hex;
    /**
     * Start and end of the input window, in seconds.
     */
    inputWindow: readonly [bigint, bigint];
    /**
     * Commitment to the committee public key, zero until the committee has published it.
     */
    committeeKeyCommitment: Hex;
    /**
     * BFV parameter set of the round.
     */
    paramSet: number;
}

export interface ICrispVotingPower {
    /**
     * Voting power the slot may spend in the round, in ballot units.
     */
    ballotVotingPower: bigint;
    /**
     * Voting power of the slot at the round snapshot, in raw token units.
     */
    rawVotingPower: bigint;
    /**
     * Raw token units in one ballot unit, recorded by the program for the round. A slot needs to
     * hold at least this much to vote.
     */
    votingPowerDivisor: bigint;
}

export interface ICrispBallotContext extends ICrispE3Record {
    /**
     * Voting power of the voter in ballot units.
     */
    votingPower: bigint;
    /**
     * Exclusive end of the window in which a ballot can be committed, in seconds.
     */
    commitmentDeadline: bigint;
    /**
     * ABI-encoded BFV parameters of the round, to verify the committee key against.
     */
    encodedParams: Hex;
}

/**
 * On-chain reads of a round, shared by the ballot flow and the voting power display. Everything is
 * read from the contracts that verify the ballot instead of recomputed: a client that derived the
 * snapshot, the divisor or the rounding slightly differently would produce ballots rejected with
 * nothing naming the cause.
 */
class CrispRoundUtils {
    /**
     * Reads the E3 record of a round through the coordinator of the plugin that requested it. The
     * CRISP program is resolved from the record, as the E3 is the authority on which program runs
     * a round.
     *
     * @throws When the coordinator of the plugin is not the one configured for the network, as the
     * program it names would then be one the app has no reason to trust.
     */
    readE3Record = async (params: {
        network: Network;
        pluginAddress: Hex;
        e3Id: bigint;
    }): Promise<ICrispE3Record> => {
        const { network, pluginAddress, e3Id } = params;
        const chainId = networkDefinitions[network].id;

        const interfoldAddress = await readContract(wagmiConfig, {
            address: pluginAddress,
            chainId,
            abi: crispPluginAbi,
            functionName: 'interfold',
        });

        const expectedInterfold = crispE3Config[network]?.interfoldAddress;

        if (
            expectedInterfold == null ||
            !isAddressEqual(interfoldAddress, expectedInterfold)
        ) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.interfoldUnexpected',
            );
        }

        const e3 = await readContract(wagmiConfig, {
            address: interfoldAddress,
            chainId,
            abi: crispInterfoldAbi,
            functionName: 'getE3',
            args: [e3Id],
        });

        return {
            interfoldAddress,
            programAddress: e3.e3Program,
            inputWindow: e3.inputWindow,
            committeeKeyCommitment: e3.committeePublicKey,
            paramSet: e3.paramSet,
        };
    };

    /**
     * Reads the voting power of a slot: the spendable power in ballot units from the program, and
     * the raw power at the snapshot of the program from the token.
     */
    readVotingPower = async (params: {
        network: Network;
        programAddress: Hex;
        tokenAddress: Hex;
        e3Id: bigint;
        slot: Hex;
    }): Promise<ICrispVotingPower> => {
        const { network, programAddress, tokenAddress, e3Id, slot } = params;
        const chainId = networkDefinitions[network].id;

        const [ballotVotingPower, snapshot, votingPowerDivisor] =
            await Promise.all([
                this.readSlotVotingPower({
                    network,
                    programAddress,
                    e3Id,
                    slot,
                }),
                readContract(wagmiConfig, {
                    address: programAddress,
                    chainId,
                    abi: crispProgramAbi,
                    functionName: 'snapshotOf',
                    args: [e3Id],
                }),
                readContract(wagmiConfig, {
                    address: programAddress,
                    chainId,
                    abi: crispProgramAbi,
                    functionName: 'votingPowerDivisorOf',
                    args: [e3Id],
                }),
            ]);

        const rawVotingPower = await readContract(wagmiConfig, {
            address: tokenAddress,
            chainId,
            abi: crispVotesTokenAbi,
            functionName: 'getPastVotes',
            args: [slot, BigInt(snapshot)],
        });

        return {
            ballotVotingPower,
            rawVotingPower,
            votingPowerDivisor,
        };
    };

    /**
     * Reads only the spendable voting power of a slot in ballot units, which is zero for a slot the
     * program does not consider eligible.
     */
    readSlotVotingPower = (params: {
        network: Network;
        programAddress: Hex;
        e3Id: bigint;
        slot: Hex;
    }): Promise<bigint> => {
        const { network, programAddress, e3Id, slot } = params;

        return readContract(wagmiConfig, {
            address: programAddress,
            chainId: networkDefinitions[network].id,
            abi: crispProgramAbi,
            functionName: 'votingPowerOf',
            args: [e3Id, slot],
        });
    };

    /**
     * Reads everything a voter needs before encrypting a ballot and refuses where the CRISP program
     * would reject the ballot anyway, as proving takes long. The slot is the voter's own for a vote,
     * and the slot to mask for a mask, which can be someone else's.
     */
    readBallotContext = async (params: {
        network: Network;
        pluginAddress: Hex;
        e3Id: bigint;
        slot: Hex;
        /**
         * Defines if the slot belongs to the connected voter, which only changes how a refusal is
         * worded.
         * @default true
         */
        isOwnSlot?: boolean;
    }): Promise<ICrispBallotContext> => {
        const { network, pluginAddress, e3Id, slot, isOwnSlot = true } = params;
        const chainId = networkDefinitions[network].id;

        const record = await this.readE3Record({
            network,
            pluginAddress,
            e3Id,
        });
        const { programAddress, paramSet, inputWindow } = record;

        const [censusMode, votingPower, commitmentDeadline, encodedParams] =
            await Promise.all([
                readContract(wagmiConfig, {
                    address: programAddress,
                    chainId,
                    abi: crispProgramAbi,
                    functionName: 'censusModeOf',
                    args: [e3Id],
                }),
                this.readSlotVotingPower({
                    network,
                    programAddress,
                    e3Id,
                    slot,
                }),
                readContract(wagmiConfig, {
                    address: programAddress,
                    chainId,
                    abi: crispProgramAbi,
                    functionName: 'inputCommitmentDeadline',
                    args: [e3Id],
                }),
                readContract(wagmiConfig, {
                    address: record.interfoldAddress,
                    chainId,
                    abi: crispInterfoldAbi,
                    functionName: 'paramSetRegistry',
                    args: [paramSet],
                }),
            ]);

        // Merkle census rounds need a proof the plugin never requests.
        if (Number(censusMode) !== onchainCensusMode) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.censusNotOnchain',
            );
        }

        if (votingPower === BigInt(0)) {
            throw new CrispError(
                isOwnSlot
                    ? 'app.plugins.crisp.crispSubmitVoteDialog.error.noVotingPower'
                    : 'app.plugins.crisp.crispSubmitVoteDialog.error.noVotingPowerMaskTarget',
            );
        }

        const now = BigInt(Math.floor(Date.now() / 1000));

        if (now < inputWindow[0]) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.votingNotStarted',
            );
        }

        if (now >= commitmentDeadline) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.deadlinePassed',
            );
        }

        return { ...record, votingPower, commitmentDeadline, encodedParams };
    };

    /**
     * Reads the digest the voter signs to authorise a ballot from the program that verifies it.
     */
    readBallotDigest = (params: {
        network: Network;
        programAddress: Hex;
        e3Id: bigint;
        slot: Hex;
        ciphertextCommitment: Hex;
    }): Promise<Hex> => {
        const { network, programAddress, e3Id, slot, ciphertextCommitment } =
            params;

        return readContract(wagmiConfig, {
            address: programAddress,
            chainId: networkDefinitions[network].id,
            abi: crispProgramAbi,
            functionName: 'ballotDigest',
            args: [e3Id, slot, ciphertextCommitment],
        });
    };
}

export const crispRoundUtils = new CrispRoundUtils();
