import type * as CrispSdk from '@crisp-e3/sdk';
import type {
    CircuitBundle,
    CircuitPreset,
    InputIdentity,
    PreparedBallot,
    ProofData,
    SlotHead,
} from '@crisp-e3/sdk';
import {
    bytesToHex,
    decodeAbiParameters,
    type Hex,
    parseAbiParameters,
} from 'viem';
import type { Network } from '@/shared/api/daoService';
import { networkDefinitions } from '@/shared/constants/networkDefinitions';
import { crispE3Config } from '../../constants/crispE3Config';
import { CrispError } from '../../types';

/**
 * BFV parameters of a round as published on-chain in `Interfold.paramSetRegistry`.
 */
export interface ICrispBfvParams {
    degree: bigint;
    plaintextModulus: bigint;
    moduli: readonly bigint[];
}

export interface IVerifyCommitteeKeyParams {
    /**
     * Serialized BFV public key to verify, as served by the CRISP server.
     */
    publicKey: Uint8Array;
    /**
     * Network of the round, whose configuration lists the presets a round may run under.
     */
    network: Network;
    /**
     * Commitment to the committee key recorded on-chain in the E3 record of the round.
     */
    committeeKeyCommitment: Hex;
    /**
     * ABI-encoded BFV parameters of the round, from `Interfold.paramSetRegistry(paramSet)`.
     */
    encodedParams: Hex;
}

export interface IPrepareBallotParams {
    /**
     * Network of the round, whose RPC proxy the slot head is read through.
     */
    network: Network;
    /**
     * Address of the CRISP program of the round, whose events record the entries of the slot.
     */
    programAddress: Hex;
    /**
     * Base URL of the CRISP server of the round, whose availability store serves the ciphertext of
     * the slot head. The bytes are checked against their on-chain hash before use.
     */
    serverUrl: string;
    /**
     * Identifier of the E3 round the ballot belongs to.
     */
    e3Id: bigint;
    /**
     * Verified BFV public key of the ciphernode committee, used to encrypt the ballot.
     */
    publicKey: Uint8Array;
    /**
     * Circuit preset of the round, as returned by the committee key verification.
     */
    preset: CircuitPreset;
    /**
     * Address of the slot the ballot is written to, which is the voter for a vote and the target
     * for a mask.
     */
    slotAddress: string;
    /**
     * Ballot as one value per option, the weight on the chosen option and zero elsewhere. A mask is
     * zero everywhere.
     */
    vote: number[];
    /**
     * Defines if the ballot is a mask: a zero ballot written unsigned to a slot, which cannot be
     * told apart from a vote on-chain.
     * @default false
     */
    isMaskVote?: boolean;
    /**
     * Voting power of the slot in ballot units, as `CRISPProgram.votingPowerOf` reports it. The
     * program verifies the proof against exactly this number.
     */
    votingPower: bigint;
}

export interface IFinishBallotParams {
    /**
     * Output of `prepareBallot`.
     */
    prepared: PreparedBallot;
    /**
     * Ballot digest read from `CRISPProgram.ballotDigest`.
     */
    digest: Hex;
    /**
     * Signature of the voter over the digest.
     */
    signature: Hex;
}

export interface IFinishMaskParams
    extends Omit<IFinishBallotParams, 'signature'> {}

// Circuit preset of each BFV parameter set the app has circuits for. An unlisted set is refused
// instead of proved with other circuits, as that proof would fail on-chain.
const circuitPresets = {
    INSECURE_THRESHOLD_64: 'insecure-64',
    SECURE_THRESHOLD_8192: 'secure-8192',
} as const satisfies Record<string, CircuitPreset>;

const bfvParametersAbi = parseAbiParameters(
    '(uint256 degree, uint256 plaintextModulus, uint256[] moduli, string error1Variance)',
);

const circuitLoaders: Record<
    CircuitPreset,
    () => Promise<{ loadCircuits: () => Promise<CircuitBundle> }>
> = {
    'insecure-64': () => import('@crisp-e3/sdk/insecure-64'),
    'secure-8192': () => import('@crisp-e3/sdk/secure-8192'),
};

/**
 * Wrapper around the CRISP SDK and the Interfold WASM module. They are imported dynamically as
 * they weigh megabytes and initialise WASM at import time, which must not run during SSR.
 */
class CrispSdkUtils {
    private loading?: { preset: CircuitPreset; promise: Promise<void> };

    /**
     * Decodes the ABI-encoded BFV parameters a round runs under.
     */
    private decodeBfvParams = (encodedParams: Hex): ICrispBfvParams => {
        const [{ degree, plaintextModulus, moduli }] = decodeAbiParameters(
            bfvParametersAbi,
            encodedParams,
        );

        return { degree, plaintextModulus, moduli };
    };

    /**
     * Verifies that the committee public key served by the CRISP server is the one the committee
     * produced, by comparing its recomputed commitment to the one recorded on-chain. Encrypting to
     * an unverified key would let whoever supplied it decrypt the ballot.
     *
     * @returns The circuit preset matching the BFV parameters of the round.
     * @throws When the key cannot be verified.
     */
    verifyCommitteeKey = async (
        params: IVerifyCommitteeKeyParams,
    ): Promise<CircuitPreset> => {
        const { network, publicKey, committeeKeyCommitment, encodedParams } =
            params;

        if (publicKey.length === 0) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.committeeKeyEmpty',
            );
        }

        if (BigInt(committeeKeyCommitment) === BigInt(0)) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.committeeKeyNotCommitted',
            );
        }

        if (encodedParams === '0x') {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.paramsNotRegistered',
            );
        }

        const bfvParams = this.decodeBfvParams(encodedParams);

        const { default: initializeWasm } = await import(
            '@interfold/wasm/init'
        );
        await initializeWasm();
        const wasm = await import('@interfold/wasm');

        const presetName = (
            Object.keys(circuitPresets) as Array<keyof typeof circuitPresets>
        ).find((name) => {
            const preset = wasm.get_bfv_params(name) as {
                degree: number | bigint;
                plaintext_modulus: number | bigint;
                moduli: Array<number | bigint>;
            };

            return (
                BigInt(preset.degree) === bfvParams.degree &&
                BigInt(preset.plaintext_modulus) ===
                    bfvParams.plaintextModulus &&
                preset.moduli.length === bfvParams.moduli.length &&
                preset.moduli.every(
                    (modulus, index) =>
                        BigInt(modulus) === bfvParams.moduli[index],
                )
            );
        });

        if (presetName == null) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.paramsUnsupported',
            );
        }

        const preset = circuitPresets[presetName];

        // The insecure preset has no place on a network where real value is at stake.
        if (!crispE3Config[network]?.allowedPresets.includes(preset)) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.presetNotAllowed',
                { params: { preset } },
            );
        }

        // Throws on bytes that are not a decodable BFV key, which is the same rejection.
        let actualCommitment: Uint8Array;
        try {
            actualCommitment = wasm.compute_pk_commitment(
                publicKey,
                Number(bfvParams.degree),
                bfvParams.plaintextModulus,
                BigUint64Array.from(bfvParams.moduli),
            );
        } catch (error) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.committeeKeyInvalid',
                { cause: error },
            );
        }

        if (
            bytesToHex(actualCommitment) !==
            committeeKeyCommitment.toLowerCase()
        ) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.committeeKeyMismatch',
            );
        }

        return preset;
    };

    /**
     * Installs the circuits a round needs, at most once per session. The SDK keeps a single set of
     * circuits, so a round needing another preset than the loaded one is refused.
     */
    private ensureCircuits = async (preset: CircuitPreset): Promise<void> => {
        const { registeredPreset, setCircuits } = await import('@crisp-e3/sdk');

        const active = registeredPreset();

        if (active === preset) {
            return;
        }

        if (active != null) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.circuitsLoaded',
                { params: { active, preset } },
            );
        }

        if (this.loading != null && this.loading.preset !== preset) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.circuitsLoading',
                { params: { loading: this.loading.preset, preset } },
            );
        }

        this.loading ??= {
            preset,
            promise: (async () => {
                const { loadCircuits } = await circuitLoaders[preset]();
                setCircuits(await loadCircuits());
            })().finally(() => {
                this.loading = undefined;
            }),
        };

        await this.loading.promise;
    };

    /**
     * First phase of a ballot: encrypts it under the committee key, before the voter signs. The
     * digest the voter signs commits to this exact ciphertext.
     *
     * The slot head the ballot extends is resolved from the program's events rather than taken from
     * the CRISP server, which could otherwise hand out a stale head and have the ballot silently
     * dropped from the tally. Only the bytes come from the server, verified against their hash.
     */
    prepareBallot = async (
        params: IPrepareBallotParams,
    ): Promise<PreparedBallot> => {
        const {
            network,
            programAddress,
            serverUrl,
            e3Id,
            publicKey,
            preset,
            slotAddress,
            vote,
            isMaskVote = false,
            votingPower,
        } = params;

        await this.ensureCircuits(preset);

        const { createHttpDaReader, getSlotHead, prepareBallot } = await import(
            '@crisp-e3/sdk'
        );
        const chainId = networkDefinitions[network].id;

        let head: SlotHead | undefined;
        try {
            head = await getSlotHead({
                programAddress,
                e3Id,
                slot: slotAddress,
                chainId,
                rpcUrl: `/api/rpc/${chainId.toString()}`,
                daReader: createHttpDaReader(`${serverUrl}/availability`),
            });
        } catch (error) {
            throw new CrispError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.slotHeadUnavailable',
                { cause: error },
            );
        }

        const inputs = {
            publicKey,
            slotAddress,
            isMaskVote,
            numOptions: vote.length,
            vote,
            censusMode: 'onchain' as const,
            votingPower,
        };

        return prepareBallot(
            head == null
                ? inputs
                : {
                      ...inputs,
                      previousCiphertext: head.ciphertext,
                      previousIndex: head.index,
                  },
        );
    };

    /**
     * Second phase of a ballot: proves it given the signature over its digest, returning the
     * Solidity-encoded envelope the CRISP server stages.
     */
    finishBallot = (params: IFinishBallotParams): Promise<Hex> => {
        const { prepared, digest, signature } = params;

        return this.finishProof((sdk) =>
            sdk.finishBallotProof(prepared, digest, signature),
        );
    };

    /**
     * Second phase of a mask: proves it against the same digest a vote carries, with no
     * signature, as the circuit does not check one on the mask branch.
     */
    finishMask = (params: IFinishMaskParams): Promise<Hex> => {
        const { prepared, digest } = params;

        return this.finishProof((sdk) => sdk.finishMaskProof(prepared, digest));
    };

    /**
     * Reads the identity of an input (slot, ciphertext commitment, ciphertext hash and parent) from
     * the envelope the SDK builds.
     */
    decodeInputIdentity = async (encodedProof: Hex): Promise<InputIdentity> => {
        const { decodeInputIdentity } = await import('@crisp-e3/sdk');

        return decodeInputIdentity(encodedProof);
    };

    // Both proofs come back in the same shape and leave as the same Solidity envelope.
    private finishProof = async (
        prove: (sdk: typeof CrispSdk) => Promise<ProofData>,
    ): Promise<Hex> => {
        const sdk = await import('@crisp-e3/sdk');

        return sdk.encodeSolidityProof(await prove(sdk));
    };
}

export const crispSdkUtils = new CrispSdkUtils();
