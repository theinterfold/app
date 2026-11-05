import {
    BaseError,
    ContractFunctionRevertedError,
    encodeAbiParameters,
    type Hex,
    parseAbiParameters,
    type TransactionReceipt,
} from 'viem';
import * as wagmiActions from 'wagmi/actions';
import { Network } from '@/shared/api/daoService';
import {
    CrispServiceError,
    crispService,
    type ICrispVoteResponse,
} from '../../api/crispService';
import {
    generateCrispAttestedPayload,
    generateCrispCommitLog,
    generateCrispCommitReceipt,
    generateCrispInputIdentity,
} from '../../testUtils';
import { crispBallotUtils } from './crispBallotUtils';

const transactionHash = `0x${'ab'.repeat(32)}` as const;
const programAddress = '0x00000000000000000000000000000000000000b2' as const;
const defaultE3Id = BigInt(7);
const identity = generateCrispInputIdentity();
const buildAttestedPayload = generateCrispAttestedPayload;
const buildLog = generateCrispCommitLog;
const buildReceipt = generateCrispCommitReceipt;

const generateVoteResponse = (
    overrides?: Partial<ICrispVoteResponse>,
): ICrispVoteResponse => ({
    status: 'success',
    tx_hash: null,
    job_id: null,
    encoded_proof: null,
    message: null,
    ...overrides,
});

describe('crispBallot utils', () => {
    describe('buildBallotSignatureRequest', () => {
        it('builds the EIP-712 Ballot request of the CRISP program', () => {
            const request = crispBallotUtils.buildBallotSignatureRequest({
                chainId: 11_155_111,
                crispProgram: '0x0000000000000000000000000000000000000001',
                e3Id: BigInt(12),
                slot: '0x0000000000000000000000000000000000000002',
                ciphertextCommitment: '0x01',
            });

            expect(request.domain).toEqual({
                name: 'CRISP',
                version: '1',
                chainId: 11_155_111,
                verifyingContract: '0x0000000000000000000000000000000000000001',
            });
            expect(request.primaryType).toEqual('Ballot');
            expect(request.types.Ballot.map((field) => field.name)).toEqual([
                'e3Id',
                'slot',
                'ciphertextCommitment',
            ]);
            expect(request.message.e3Id).toEqual(BigInt(12));
        });
    });

    describe('followStagedBallot', () => {
        const availabilitySpy = jest.spyOn(crispService, 'getVoteAvailability');
        const network = Network.ETHEREUM_SEPOLIA;

        const follow = (
            view: ICrispVoteResponse,
            overrides?: { isCancelled?: () => boolean },
        ) =>
            crispBallotUtils.followStagedBallot({
                network,
                view,
                isCancelled: () => false,
                onView: jest.fn(),
                ...overrides,
            });

        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            availabilitySpy.mockReset();
            jest.useRealTimers();
        });

        it('reports a failed broadcast with the reason of the server', async () => {
            const view = generateVoteResponse({
                status: 'failed_broadcast',
                message: 'rate limited',
            });

            await expect(follow(view)).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.serverReason',
                    params: { reason: 'rate limited' },
                }),
            );
        });

        it('treats a transaction hash as committed even when a payload is still available', async () => {
            // Sending the payload again would be a second commitment the program refuses.
            const view = generateVoteResponse({
                status: 'ready_for_commitment',
                tx_hash: transactionHash,
                encoded_proof: '0x1234',
            });

            await expect(follow(view)).resolves.toEqual({
                action: 'committed',
                transactionHash,
            });
        });

        it('refuses a transaction hash that is not a hash', async () => {
            const view = generateVoteResponse({
                status: 'success',
                tx_hash: '../etc/passwd',
            });

            await expect(follow(view)).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.transactionHashInvalid',
                }),
            );
        });

        it('hands the attested payload to the wallet when ready for commitment', async () => {
            const view = generateVoteResponse({
                status: 'ready_for_commitment',
                encoded_proof: '0x1234',
            });

            await expect(follow(view)).resolves.toEqual({
                action: 'submit',
                payload: '0x1234',
            });
        });

        it('errors when ready for commitment without a payload', async () => {
            const view = generateVoteResponse({
                status: 'ready_for_commitment',
            });

            await expect(follow(view)).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.noPayload',
                }),
            );
        });

        it('treats success and pending availability without a hash as committed', async () => {
            const committed = { action: 'committed', transactionHash: null };

            await expect(
                follow(generateVoteResponse({ status: 'success' })),
            ).resolves.toEqual(committed);
            await expect(
                follow(
                    generateVoteResponse({ status: 'pending_availability' }),
                ),
            ).resolves.toEqual(committed);
        });

        it('errors on a pending commitment without a job id', async () => {
            const view = generateVoteResponse({ status: 'pending_commitment' });

            await expect(follow(view)).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.noJob',
                }),
            );
        });

        it('reads the job until the server chooses who sends the commitment', async () => {
            const onView = jest.fn();
            const decided = generateVoteResponse({
                status: 'ready_for_commitment',
                encoded_proof: '0x1234',
            });
            availabilitySpy
                .mockResolvedValueOnce(
                    generateVoteResponse({ status: 'pending_commitment' }),
                )
                .mockResolvedValueOnce(decided);

            const result = crispBallotUtils.followStagedBallot({
                network,
                view: generateVoteResponse({
                    status: 'pending_commitment',
                    job_id: 'job-1',
                }),
                isCancelled: () => false,
                onView,
            });
            await jest.advanceTimersByTimeAsync(5000);

            await expect(result).resolves.toEqual({
                action: 'submit',
                payload: '0x1234',
            });
            expect(availabilitySpy).toHaveBeenCalledWith({
                network,
                jobId: 'job-1',
            });
            expect(onView).toHaveBeenCalledWith(decided);
        });

        it('errors when the server does not know the job', async () => {
            availabilitySpy.mockRejectedValue(
                new CrispServiceError('key', 404),
            );

            await expect(
                follow(
                    generateVoteResponse({
                        status: 'pending_commitment',
                        job_id: 'job-1',
                    }),
                ),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.ballotGone',
                }),
            );
        });

        it.each([
            ['a network failure', new Error('network down')],
            ['a server error', new CrispServiceError('key', 504)],
        ])(
            'keeps polling after %s and reports it at the timeout',
            async (_, error) => {
                availabilitySpy.mockRejectedValue(error);

                const result = follow(
                    generateVoteResponse({
                        status: 'pending_commitment',
                        job_id: 'job-1',
                    }),
                );
                const assertion = expect(result).rejects.toBe(error);
                await jest.advanceTimersByTimeAsync(600_000);

                await assertion;
                expect(availabilitySpy.mock.calls.length).toBeGreaterThan(1);
            },
        );

        it('gives up on the first read the server rejects for good', async () => {
            availabilitySpy.mockRejectedValue(
                new CrispServiceError('forbidden', 403),
            );

            await expect(
                follow(
                    generateVoteResponse({
                        status: 'pending_commitment',
                        job_id: 'job-1',
                    }),
                ),
            ).rejects.toThrow(
                expect.objectContaining({ errorKey: 'forbidden' }),
            );
            expect(availabilitySpy).toHaveBeenCalledTimes(1);
        });

        it('reports that the ballot is not processed yet when the reads keep answering pending', async () => {
            availabilitySpy.mockResolvedValue(
                generateVoteResponse({
                    status: 'pending_commitment',
                    job_id: 'job-1',
                }),
            );

            const result = follow(
                generateVoteResponse({
                    status: 'pending_commitment',
                    job_id: 'job-1',
                }),
            );
            const assertion = expect(result).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.ballotNotProcessed',
                }),
            );
            await jest.advanceTimersByTimeAsync(600_000);

            await assertion;
        });

        it('stops without reading when cancelled', async () => {
            const result = await follow(
                generateVoteResponse({
                    status: 'pending_commitment',
                    job_id: 'job-1',
                }),
                { isCancelled: () => true },
            );

            expect(result).toBeUndefined();
            expect(availabilitySpy).not.toHaveBeenCalled();
        });
    });

    describe('describeFailure', () => {
        const buildRevert = (errorName: string) => {
            const revert = new ContractFunctionRevertedError({
                abi: [],
                functionName: 'publishInput',
                message: 'reverted',
            });
            Object.defineProperty(revert, 'data', {
                value: { errorName, args: [] },
            });

            return new BaseError('wrapper', { cause: revert });
        };

        it('maps a recognised CRISP custom error to its translation key', () => {
            const error = buildRevert('InputAlreadyCommitted');

            expect(crispBallotUtils.describeFailure(error)).toMatchObject({
                errorKey:
                    'app.plugins.crisp.crispSubmitVoteDialog.error.alreadySubmitted',
            });
        });

        it('names an unrecognised custom error of the CRISP program', () => {
            const error = buildRevert('SomethingNew');

            expect(crispBallotUtils.describeFailure(error)).toMatchObject({
                errorKey:
                    'app.plugins.crisp.crispSubmitVoteDialog.error.contractRejected',
                params: { errorName: 'SomethingNew' },
            });
        });

        it('uses the short message of viem errors', () => {
            const error = new BaseError('User rejected the request.');

            expect(crispBallotUtils.describeFailure(error).message).toEqual(
                'User rejected the request.',
            );
        });

        it('passes other errors through', () => {
            const error = new Error('boom');

            expect(crispBallotUtils.describeFailure(error)).toBe(error);
            expect(crispBallotUtils.describeFailure('text').message).toEqual(
                'text',
            );
        });
    });

    describe('parseTransactionHash', () => {
        it('returns a transaction hash and drops anything else', () => {
            expect(
                crispBallotUtils.parseTransactionHash(transactionHash),
            ).toEqual(transactionHash);
            expect(
                crispBallotUtils.parseTransactionHash('0xabc'),
            ).toBeUndefined();
            expect(crispBallotUtils.parseTransactionHash(null)).toBeUndefined();
            expect(
                crispBallotUtils.parseTransactionHash(undefined),
            ).toBeUndefined();
        });
    });

    describe('assertAttestedPayload', () => {
        const assert = (payload: Hex) =>
            crispBallotUtils.assertAttestedPayload({ identity, payload });

        const mismatchError = expect.objectContaining({
            errorKey:
                'app.plugins.crisp.crispSubmitVoteDialog.error.attestedPayloadMismatch',
        });

        it('accepts a payload that carries the identity of the ballot, however its hex is cased', () => {
            expect(() => assert(buildAttestedPayload())).not.toThrow();
            expect(() =>
                assert(
                    buildAttestedPayload({
                        slotAddress: identity.slotAddress
                            .toUpperCase()
                            .replace('0X', '0x') as Hex,
                    }),
                ),
            ).not.toThrow();
        });

        it.each([
            {
                field: 'slot',
                override: {
                    slotAddress:
                        '0x00000000000000000000000000000000000000e5' as Hex,
                },
            },
            {
                field: 'ciphertext commitment',
                override: {
                    encryptedVoteCommitment: `0x${'33'.repeat(32)}` as Hex,
                },
            },
            {
                field: 'ciphertext hash',
                override: { encryptedVoteHash: `0x${'44'.repeat(32)}` as Hex },
            },
            { field: 'parent index', override: { parentIndexPlusOne: 4 } },
        ])('refuses a payload that names another $field', ({ override }) => {
            expect(() => assert(buildAttestedPayload(override))).toThrow(
                mismatchError,
            );
        });

        it('refuses a payload that cannot be decoded', () => {
            expect(() => assert('0x1234')).toThrow(mismatchError);
        });

        it('refuses the envelope of the SDK, which carries no attestation', () => {
            const envelope = encodeAbiParameters(
                parseAbiParameters(
                    'bytes, address, bytes32, bytes32, uint40, bytes',
                ),
                [
                    '0x1234',
                    identity.slotAddress,
                    identity.encryptedVoteCommitment,
                    identity.encryptedVoteHash,
                    3,
                    '0xabcd',
                ],
            );

            expect(() => assert(envelope)).toThrow(mismatchError);
        });
    });

    describe('assertCommitted', () => {
        const expectation = { programAddress, e3Id: defaultE3Id, identity };

        const assert = (receipt: TransactionReceipt) =>
            crispBallotUtils.assertCommitted({ receipt, expectation });

        it('accepts a receipt with the commitment of the ballot in the round and slot', () => {
            expect(() => assert(buildReceipt([buildLog()]))).not.toThrow();
        });

        it('refuses a reverted transaction', () => {
            expect(() =>
                assert(buildReceipt([buildLog()], 'reverted')),
            ).toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.transactionReverted',
                }),
            );
        });

        it.each([
            { name: 'another round', override: { e3Id: BigInt(8) } },
            {
                name: 'another slot',
                override: {
                    slotAddress:
                        '0x00000000000000000000000000000000000000e5' as Hex,
                },
            },
            {
                name: 'another ciphertext commitment',
                override: {
                    encryptedVoteCommitment: `0x${'33'.repeat(32)}` as Hex,
                },
            },
            {
                name: 'another contract',
                override: {
                    address:
                        '0x00000000000000000000000000000000000000f6' as Hex,
                },
            },
        ])('refuses a receipt whose event is for $name', ({ override }) => {
            expect(() => assert(buildReceipt([buildLog(override)]))).toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.commitmentNotFound',
                }),
            );
        });

        it('refuses a successful transaction that emitted no commitment', () => {
            expect(() => assert(buildReceipt([]))).toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.commitmentNotFound',
                }),
            );
        });
    });

    describe('confirmRelayedCommitment', () => {
        const waitForReceiptSpy = jest.spyOn(
            wagmiActions,
            'waitForTransactionReceipt',
        );
        const params = {
            network: Network.ETHEREUM_SEPOLIA,
            transactionHash,
            expectation: { programAddress, e3Id: defaultE3Id, identity },
        };

        afterEach(() => {
            waitForReceiptSpy.mockReset();
        });

        it('accepts the receipt of the reported transaction, read on the chain of the round', async () => {
            waitForReceiptSpy.mockResolvedValue(
                buildReceipt([buildLog()]) as never,
            );

            await expect(
                crispBallotUtils.confirmRelayedCommitment(params),
            ).resolves.toBeUndefined();

            expect(waitForReceiptSpy.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    hash: transactionHash,
                    chainId: 11_155_111,
                }),
            );
        });

        it('refuses a transaction that does not commit the ballot', async () => {
            waitForReceiptSpy.mockResolvedValue({
                status: 'success',
                logs: [],
            } as unknown as Awaited<
                ReturnType<typeof wagmiActions.waitForTransactionReceipt>
            >);

            await expect(
                crispBallotUtils.confirmRelayedCommitment(params),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.commitmentNotFound',
                }),
            );
        });

        it('refuses a transaction that cannot be read', async () => {
            waitForReceiptSpy.mockRejectedValue(new Error('timeout'));

            await expect(
                crispBallotUtils.confirmRelayedCommitment(params),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.commitmentUnconfirmed',
                }),
            );
        });
    });
});
