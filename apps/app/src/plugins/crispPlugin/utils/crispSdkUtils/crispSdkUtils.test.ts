import type { PreparedBallot } from '@crisp-e3/sdk';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { crispSdkUtils, type IPrepareBallotParams } from './crispSdkUtils';

const mockSdkPrepareBallot = jest.fn();
const mockFinishBallotProof = jest.fn();
const mockFinishMaskProof = jest.fn();

// The real SDK initialises WASM at import, which the tests below have no use for.
jest.mock('@crisp-e3/sdk', () => ({
    CrispSDK: jest.fn().mockImplementation(() => ({
        prepareBallot: mockSdkPrepareBallot,
    })),
    registeredPreset: () => 'insecure-64',
    setCircuits: jest.fn(),
    finishBallotProof: (...args: unknown[]) => mockFinishBallotProof(...args),
    finishMaskProof: (...args: unknown[]) => mockFinishMaskProof(...args),
    encodeSolidityProof: (proof: string) => `encoded:${proof}`,
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
                    publicKey: new Uint8Array(),
                    committeeKeyCommitment: `0x${'11'.repeat(32)}`,
                    encodedParams,
                }),
            ).rejects.toThrow(/empty/);
        });

        it('rejects a round whose committee has not committed a key on-chain', async () => {
            await expect(
                crispSdkUtils.verifyCommitteeKey({
                    publicKey: new Uint8Array([1]),
                    committeeKeyCommitment: `0x${'00'.repeat(32)}`,
                    encodedParams,
                }),
            ).rejects.toThrow(/no committee key commitment/);
        });

        it('rejects a round with no registered parameters', async () => {
            await expect(
                crispSdkUtils.verifyCommitteeKey({
                    publicKey: new Uint8Array([1]),
                    committeeKeyCommitment: `0x${'11'.repeat(32)}`,
                    encodedParams: '0x',
                }),
            ).rejects.toThrow(/not registered/);
        });
    });

    describe('prepareBallot', () => {
        const params: IPrepareBallotParams = {
            serverUrl: 'https://crisp.test',
            e3Id: BigInt(7),
            publicKey: new Uint8Array([1]),
            preset: 'insecure-64',
            slotAddress: '0x00000000000000000000000000000000000000d4',
            vote: [0, 0, 0],
            votingPower: BigInt(5),
        };

        beforeEach(() => {
            mockSdkPrepareBallot.mockResolvedValue({ ctCommitment: '0x12' });
        });

        afterEach(() => {
            mockSdkPrepareBallot.mockReset();
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
