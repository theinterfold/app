import * as wagmiActions from 'wagmi/actions';
import { generateCrispProposal } from '../../testUtils';
import { CrispE3FailureReason, CrispE3Stage } from '../../types';
import { crispRefundUtils, type ICrispRefundState } from './crispRefundUtils';

describe('crispRefund utils', () => {
    const buildState = (
        overrides?: Partial<ICrispRefundState>,
    ): ICrispRefundState => ({
        payer: '0x0000000000000000000000000000000000000001',
        interfold: '0x0000000000000000000000000000000000000002',
        stage: CrispE3Stage.FAILED,
        markFailedGracePeriod: 3600,
        isCalculated: true,
        amount: BigInt(100),
        isClaimed: false,
        ...overrides,
    });

    describe('fetchFailureCondition', () => {
        const readContractSpy = jest.spyOn(wagmiActions, 'readContract');
        const interfold = '0x0000000000000000000000000000000000000002';
        const params = {
            chainId: 1,
            pluginAddress:
                '0x0000000000000000000000000000000000000003' as const,
            e3Id: BigInt(7),
        };

        const mockCondition = (condition: readonly [boolean, number]) =>
            readContractSpy.mockImplementation(
                (_config, parameters) =>
                    Promise.resolve(
                        parameters.functionName === 'interfold'
                            ? interfold
                            : condition,
                    ) as never,
            );

        afterEach(() => {
            readContractSpy.mockReset();
        });

        it('asks the coordinator of the plugin whether the round can be marked as failed', async () => {
            mockCondition([true, CrispE3FailureReason.COMPUTE_TIMEOUT]);

            const reason = await crispRefundUtils.fetchFailureCondition(params);

            expect(reason).toEqual(CrispE3FailureReason.COMPUTE_TIMEOUT);
            expect(readContractSpy.mock.calls[1][1]).toMatchObject({
                address: interfold,
                functionName: 'checkFailureCondition',
                args: [BigInt(7)],
            });
        });

        it('returns null while no deadline was missed', async () => {
            mockCondition([false, CrispE3FailureReason.NONE]);

            expect(
                await crispRefundUtils.fetchFailureCondition(params),
            ).toBeNull();
        });
    });

    describe('getRefundStep', () => {
        it('marks a round that missed a deadline as failed first', () => {
            const state = buildState({
                stage: CrispE3Stage.KEY_PUBLISHED,
                isCalculated: false,
            });

            expect(crispRefundUtils.getRefundStep(state)).toEqual('markFailed');
        });

        it('processes the failure of a failed round before the refund exists', () => {
            const state = buildState({ isCalculated: false });

            expect(crispRefundUtils.getRefundStep(state)).toEqual(
                'processFailure',
            );
        });

        it('claims the refund once it is calculated', () => {
            expect(crispRefundUtils.getRefundStep(buildState())).toEqual(
                'claim',
            );
        });

        it('has nothing to do once the refund was claimed', () => {
            const state = buildState({ isClaimed: true });

            expect(crispRefundUtils.getRefundStep(state)).toBeUndefined();
        });

        it('has nothing to do when the failure left nothing for the requester', () => {
            const state = buildState({ amount: BigInt(0) });

            expect(crispRefundUtils.getRefundStep(state)).toBeUndefined();
        });
    });

    describe('getMarkFailedStart', () => {
        it('opens the call to anyone once the grace period after the missed deadline ends', () => {
            const proposal = generateCrispProposal({
                e3StageDeadline: 1_793_917_932,
            });

            expect(
                crispRefundUtils.getMarkFailedStart(proposal, buildState()),
            ).toEqual((1_793_917_932 + 3600) * 1000);
        });

        it('is unknown while the backend has not read the deadline', () => {
            expect(
                crispRefundUtils.getMarkFailedStart(
                    generateCrispProposal(),
                    buildState(),
                ),
            ).toBeUndefined();
        });
    });
});
