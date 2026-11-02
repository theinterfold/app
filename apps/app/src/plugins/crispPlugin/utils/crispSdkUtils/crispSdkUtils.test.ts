import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { crispSdkUtils } from './crispSdkUtils';

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
});
