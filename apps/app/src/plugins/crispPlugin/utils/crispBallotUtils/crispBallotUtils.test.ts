import { BaseError, ContractFunctionRevertedError } from 'viem';
import { Network } from '@/shared/api/daoService';
import {
    CrispServiceError,
    crispService,
    type ICrispVoteResponse,
} from '../../api/crispService';
import { crispBallotUtils } from './crispBallotUtils';

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

        it('reports a failed broadcast with the server message', async () => {
            const view = generateVoteResponse({
                status: 'failed_broadcast',
                message: 'rate limited',
            });

            await expect(follow(view)).rejects.toThrow('rate limited');
        });

        it('treats a transaction hash as committed even when a payload is still available', async () => {
            // Sending the payload again would be a second commitment the program refuses.
            const view = generateVoteResponse({
                status: 'ready_for_commitment',
                tx_hash: '0xabc',
                encoded_proof: '0x1234',
            });

            await expect(follow(view)).resolves.toEqual({
                action: 'committed',
                transactionHash: '0xabc',
            });
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

            await expect(follow(view)).rejects.toThrow(/attested payload/);
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

            await expect(follow(view)).rejects.toThrow(/did not return a job/);
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
                new CrispServiceError('not found', 404),
            );

            await expect(
                follow(
                    generateVoteResponse({
                        status: 'pending_commitment',
                        job_id: 'job-1',
                    }),
                ),
            ).rejects.toThrow(/no longer has this ballot/);
        });

        it.each([
            ['a network failure', new Error('network down')],
            [
                'a server error',
                new CrispServiceError('The CRISP server timed out.', 504),
            ],
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
            ).rejects.toThrow('forbidden');
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
                /not processed this ballot yet/,
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
        it('maps a recognised CRISP custom error to a message', () => {
            const revert = new ContractFunctionRevertedError({
                abi: [],
                functionName: 'publishInput',
                message: 'reverted',
            });
            Object.defineProperty(revert, 'data', {
                value: { errorName: 'InputAlreadyCommitted', args: [] },
            });
            const error = new BaseError('wrapper', { cause: revert });

            expect(crispBallotUtils.describeFailure(error).message).toEqual(
                'This ballot was already submitted.',
            );
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
});
