import type { PreparedBallot } from '@crisp-e3/sdk';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { Network } from '@/shared/api/daoService';
import { crispE3Config } from '../../constants/crispE3Config';
import { crispSdkUtils, type IPrepareBallotParams } from './crispSdkUtils';

const mockSdkPrepareBallot = jest.fn();
const mockGetSlotHead = jest.fn();
const mockCreateHttpDaReader = jest.fn();
const mockFinishBallotProof = jest.fn();
const mockFinishMaskProof = jest.fn();
const mockGetBfvParams = jest.fn();
const mockComputePkCommitment = jest.fn();

// The real SDK initialises WASM at import, which the tests below have no use for.
jest.mock('@crisp-e3/sdk', () => ({
    prepareBallot: (...args: unknown[]) => mockSdkPrepareBallot(...args),
    getSlotHead: (...args: unknown[]) => mockGetSlotHead(...args),
    createHttpDaReader: (...args: unknown[]) => mockCreateHttpDaReader(...args),
    registeredPreset: () => 'insecure-64',
    setCircuits: jest.fn(),
    finishBallotProof: (...args: unknown[]) => mockFinishBallotProof(...args),
    finishMaskProof: (...args: unknown[]) => mockFinishMaskProof(...args),
    encodeSolidityProof: (proof: string) => `encoded:${proof}`,
}));

jest.mock('@interfold/wasm/init', () => ({
    __esModule: true,
    default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@interfold/wasm', () => ({
    get_bfv_params: (...args: unknown[]) => mockGetBfvParams(...args),
    compute_pk_commitment: (...args: unknown[]) =>
        mockComputePkCommitment(...args),
}));

describe('crispSdk utils', () => {
    describe('decodeBfvParams', () => {
        it('decodes the BFV parameters as the registry of the coordinator encodes them', () => {
            const encoded = encodeAbiParameters(
                parseAbiParameters(
                    '(uint256 degree, uint256 plaintextModulus, uint256[] moduli, string error1Variance)',
                ),
                [
                    {
                        degree: BigInt(512),
                        plaintextModulus: BigInt(100),
                        moduli: [BigInt(3), BigInt(5)],
                        error1Variance: '10',
                    },
                ],
            );

            expect(crispSdkUtils.decodeBfvParams(encoded)).toEqual({
                degree: BigInt(512),
                plaintextModulus: BigInt(100),
                moduli: [BigInt(3), BigInt(5)],
            });
        });
    });

    describe('verifyCommitteeKey', () => {
        const encodedParams = '0x1234';

        it('rejects an empty key without loading the WASM module', async () => {
            await expect(
                crispSdkUtils.verifyCommitteeKey({
                    network: Network.ETHEREUM_SEPOLIA,
                    publicKey: new Uint8Array(),
                    committeeKeyCommitment: `0x${'11'.repeat(32)}`,
                    encodedParams,
                }),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.committeeKeyEmpty',
                }),
            );
        });

        it('rejects a round whose committee has not committed a key on-chain', async () => {
            await expect(
                crispSdkUtils.verifyCommitteeKey({
                    network: Network.ETHEREUM_SEPOLIA,
                    publicKey: new Uint8Array([1]),
                    committeeKeyCommitment: `0x${'00'.repeat(32)}`,
                    encodedParams,
                }),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.committeeKeyNotCommitted',
                }),
            );
        });

        it('rejects a round with no registered parameters', async () => {
            await expect(
                crispSdkUtils.verifyCommitteeKey({
                    network: Network.ETHEREUM_SEPOLIA,
                    publicKey: new Uint8Array([1]),
                    committeeKeyCommitment: `0x${'11'.repeat(32)}`,
                    encodedParams: '0x',
                }),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.paramsNotRegistered',
                }),
            );
        });
    });

    describe('verifyCommitteeKey presets', () => {
        const encodedParams = encodeAbiParameters(
            parseAbiParameters(
                '(uint256 degree, uint256 plaintextModulus, uint256[] moduli, string error1Variance)',
            ),
            [
                {
                    degree: BigInt(512),
                    plaintextModulus: BigInt(100),
                    moduli: [BigInt(3), BigInt(5)],
                    error1Variance: '10',
                },
            ],
        );
        const committeeKeyCommitment = `0x${'11'.repeat(32)}` as const;
        const sepoliaConfig = crispE3Config[Network.ETHEREUM_SEPOLIA]!;
        let configuredPresets: jest.ReplaceProperty<typeof sepoliaConfig>;

        const configurePresets = (
            allowedPresets: typeof sepoliaConfig.allowedPresets,
        ) => {
            configuredPresets = jest.replaceProperty(
                crispE3Config,
                Network.ETHEREUM_SEPOLIA,
                { ...sepoliaConfig, allowedPresets },
            );
        };

        const verify = () =>
            crispSdkUtils.verifyCommitteeKey({
                network: Network.ETHEREUM_SEPOLIA,
                publicKey: new Uint8Array([1]),
                committeeKeyCommitment,
                encodedParams,
            });

        beforeEach(() => {
            // The round runs the insecure preset, which the registry parameters match.
            mockGetBfvParams.mockImplementation((name: string) =>
                name === 'INSECURE_THRESHOLD_64'
                    ? { degree: 512, plaintext_modulus: 100, moduli: [3, 5] }
                    : { degree: 8192, plaintext_modulus: 1, moduli: [7] },
            );
            mockComputePkCommitment.mockReturnValue(
                new Uint8Array(32).fill(0x11),
            );
        });

        afterEach(() => {
            configuredPresets.restore();
            mockGetBfvParams.mockReset();
            mockComputePkCommitment.mockReset();
        });

        it('returns the preset of a round the network allows', async () => {
            configurePresets(['insecure-64']);

            await expect(verify()).resolves.toEqual('insecure-64');
        });

        it('refuses the insecure preset on a network that does not allow it, before the key is read', async () => {
            configurePresets(['secure-8192']);

            await expect(verify()).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.presetNotAllowed',
                    params: { preset: 'insecure-64' },
                }),
            );
            expect(mockComputePkCommitment).not.toHaveBeenCalled();
        });

        it('refuses every preset on a network that allows none', async () => {
            configurePresets([]);

            await expect(verify()).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.presetNotAllowed',
                }),
            );
        });

        it('refuses a network without configuration', async () => {
            await expect(
                crispSdkUtils.verifyCommitteeKey({
                    network: Network.ETHEREUM_MAINNET,
                    publicKey: new Uint8Array([1]),
                    committeeKeyCommitment,
                    encodedParams,
                }),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.presetNotAllowed',
                }),
            );
        });
    });

    describe('prepareBallot', () => {
        const params: IPrepareBallotParams = {
            network: Network.ETHEREUM_SEPOLIA,
            programAddress: '0x00000000000000000000000000000000000000b2',
            serverUrl: 'https://crisp.test',
            e3Id: BigInt(7),
            publicKey: new Uint8Array([1]),
            preset: 'insecure-64',
            slotAddress: '0x00000000000000000000000000000000000000d4',
            vote: [0, 0, 0],
            votingPower: BigInt(5),
        };
        const daReader = { read: jest.fn() };

        beforeEach(() => {
            mockSdkPrepareBallot.mockResolvedValue({ ctCommitment: '0x12' });
            mockCreateHttpDaReader.mockReturnValue(daReader);
            mockGetSlotHead.mockResolvedValue(undefined);
        });

        afterEach(() => {
            mockSdkPrepareBallot.mockReset();
            mockGetSlotHead.mockReset();
            mockCreateHttpDaReader.mockReset();
        });

        it('encrypts a vote by default', async () => {
            await crispSdkUtils.prepareBallot({ ...params, vote: [5, 0, 0] });

            expect(mockSdkPrepareBallot).toHaveBeenCalledWith(
                expect.objectContaining({
                    isMaskVote: false,
                    numOptions: 3,
                    vote: [5, 0, 0],
                }),
            );
        });

        it('encrypts a mask to the slot of its target with the voting power of that slot', async () => {
            await crispSdkUtils.prepareBallot({ ...params, isMaskVote: true });

            expect(mockSdkPrepareBallot).toHaveBeenCalledWith(
                expect.objectContaining({
                    isMaskVote: true,
                    slotAddress: params.slotAddress,
                    vote: [0, 0, 0],
                    votingPower: BigInt(5),
                    censusMode: 'onchain',
                }),
            );
        });

        it('reads the slot head from the program events through the RPC proxy, with bytes from the availability store', async () => {
            await crispSdkUtils.prepareBallot(params);

            expect(mockCreateHttpDaReader).toHaveBeenCalledWith(
                'https://crisp.test/availability',
            );
            expect(mockGetSlotHead).toHaveBeenCalledWith({
                programAddress: params.programAddress,
                e3Id: params.e3Id,
                slot: params.slotAddress,
                chainId: 11_155_111,
                rpcUrl: '/api/rpc/11155111',
                daReader,
            });
        });

        it('extends the slot head read from the chain', async () => {
            const ciphertext = new Uint8Array([9, 9]);
            mockGetSlotHead.mockResolvedValue({ ciphertext, index: 4 });

            await crispSdkUtils.prepareBallot(params);

            expect(mockSdkPrepareBallot).toHaveBeenCalledWith(
                expect.objectContaining({
                    previousCiphertext: ciphertext,
                    previousIndex: 4,
                }),
            );
        });

        it('starts an empty slot with no parent', async () => {
            await crispSdkUtils.prepareBallot(params);

            const [inputs] = mockSdkPrepareBallot.mock.calls[0];
            expect(inputs).not.toHaveProperty('previousCiphertext');
            expect(inputs).not.toHaveProperty('previousIndex');
        });

        it('refuses to build a ballot when the slot head cannot be read', async () => {
            mockGetSlotHead.mockRejectedValue(new Error('hash mismatch'));

            await expect(crispSdkUtils.prepareBallot(params)).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.slotHeadUnavailable',
                }),
            );
            expect(mockSdkPrepareBallot).not.toHaveBeenCalled();
        });
    });

    describe('finishBallot and finishMask', () => {
        const prepared = { ctCommitment: '0x12' } as unknown as PreparedBallot;

        beforeEach(() => {
            mockFinishBallotProof.mockResolvedValue('vote-proof');
            mockFinishMaskProof.mockResolvedValue('mask-proof');
        });

        afterEach(() => {
            mockFinishBallotProof.mockReset();
            mockFinishMaskProof.mockReset();
        });

        it('proves a vote with the signature of the voter', async () => {
            const encoded = await crispSdkUtils.finishBallot({
                prepared,
                digest: '0xdigest',
                signature: '0xsignature',
            });

            expect(mockFinishBallotProof).toHaveBeenCalledWith(
                prepared,
                '0xdigest',
                '0xsignature',
            );
            expect(mockFinishMaskProof).not.toHaveBeenCalled();
            expect(encoded).toEqual('encoded:vote-proof');
        });

        it('proves a mask against the digest alone, as it carries no signature', async () => {
            const encoded = await crispSdkUtils.finishMask({
                prepared,
                digest: '0xdigest',
            });

            expect(mockFinishMaskProof).toHaveBeenCalledWith(
                prepared,
                '0xdigest',
            );
            expect(mockFinishBallotProof).not.toHaveBeenCalled();
            expect(encoded).toEqual('encoded:mask-proof');
        });
    });
});
