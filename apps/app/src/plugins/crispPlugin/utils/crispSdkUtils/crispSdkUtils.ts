import type {
    CircuitBundle,
    CircuitPreset,
    PreparedBallot,
} from '@crisp-e3/sdk';
import {
    decodeAbiParameters,
    type Hex,
    hexToBytes,
    parseAbiParameters,
    size,
} from 'viem';

export type CrispPreparedBallot = PreparedBallot;

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
     * Base URL of the CRISP server of the round.
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
     * Address of the slot the ballot is written to, which is the voter.
     */
    slotAddress: string;
    /**
     * Ballot as one value per option, the weight on the chosen option and zero elsewhere.
     */
    vote: number[];
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
    prepared: CrispPreparedBallot;
    /**
     * Ballot digest read from `CRISPProgram.ballotDigest`.
     */
    digest: Hex;
    /**
     * Signature of the voter over the digest.
     */
    signature: Hex;
}

// Circuit preset of each BFV parameter set the app has circuits for. An unlisted set is refused
// instead of proved with other circuits, as that proof would fail on-chain.
const circuitPresets = {
    INSECURE_THRESHOLD_512: 'insecure-512',
    SECURE_THRESHOLD_8192: 'secure-8192',
} as const satisfies Record<string, CircuitPreset>;

const bfvParametersAbi = parseAbiParameters(
    '(uint256 degree, uint256 plaintextModulus, uint256[] moduli, string error1Variance)',
);

const circuitLoaders: Record<
    CircuitPreset,
    () => Promise<{ loadCircuits: () => Promise<CircuitBundle> }>
> = {
    'insecure-512': () => import('@crisp-e3/sdk/insecure-512'),
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
    decodeBfvParams = (encodedParams: Hex): ICrispBfvParams => {
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
        const { publicKey, committeeKeyCommitment, encodedParams } = params;

        if (publicKey.length === 0) {
            throw new Error('The committee public key is empty.');
        }

        if (
            size(committeeKeyCommitment) !== 32 ||
            BigInt(committeeKeyCommitment) === BigInt(0)
        ) {
            throw new Error(
                'The round has no committee key commitment on-chain yet.',
            );
        }

        if (encodedParams === '0x') {
            throw new Error(
                "This round's encryption parameters are not registered on-chain.",
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
            throw new Error(
                "This round's encryption parameters do not match any parameter set this app can verify.",
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
            throw new Error(
                'The committee public key is not a valid BFV key.',
                {
                    cause: error,
                },
            );
        }

        const expectedCommitment = hexToBytes(committeeKeyCommitment);
        const matches =
            actualCommitment.length === expectedCommitment.length &&
            actualCommitment.every(
                (byte, index) => byte === expectedCommitment[index],
            );

        if (!matches) {
            throw new Error(
                'The committee public key does not match the commitment recorded on-chain.',
            );
        }

        return circuitPresets[presetName];
    };

    /**
     * Installs the circuits a round needs, at most once per session. The SDK keeps a single set of
     * circuits, so a round needing another preset than the loaded one is refused.
     */
    ensureCircuits = async (preset: CircuitPreset): Promise<void> => {
        const { registeredPreset, setCircuits } = await import('@crisp-e3/sdk');

        const active = registeredPreset();

        if (active === preset) {
            return;
        }

        if (active != null) {
            throw new Error(
                `Circuits for ${active} are already loaded; this round needs ${preset}. Reload the page before voting on it.`,
            );
        }

        if (this.loading != null && this.loading.preset !== preset) {
            throw new Error(
                `Circuits for ${this.loading.preset} are still loading; this round needs ${preset}. Try again shortly.`,
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
     */
    prepareBallot = async (
        params: IPrepareBallotParams,
    ): Promise<CrispPreparedBallot> => {
        const {
            serverUrl,
            e3Id,
            publicKey,
            preset,
            slotAddress,
            vote,
            votingPower,
        } = params;

        await this.ensureCircuits(preset);

        const { CrispSDK } = await import('@crisp-e3/sdk');

        return new CrispSDK(serverUrl).prepareBallot({
            e3Id,
            publicKey,
            slotAddress,
            isMaskVote: false,
            numOptions: vote.length,
            vote,
            censusMode: 'onchain',
            votingPower,
        });
    };

    /**
     * Second phase of a ballot: proves it given the signature over its digest, returning the
     * Solidity-encoded envelope the CRISP server stages.
     */
    finishBallot = async (params: IFinishBallotParams): Promise<Hex> => {
        const { prepared, digest, signature } = params;
        const { encodeSolidityProof, finishBallotProof } = await import(
            '@crisp-e3/sdk'
        );

        const proof = await finishBallotProof(prepared, digest, signature);

        return encodeSolidityProof(proof);
    };
}

export const crispSdkUtils = new CrispSdkUtils();
