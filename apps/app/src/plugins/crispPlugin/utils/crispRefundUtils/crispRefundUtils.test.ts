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
        isSettlementOpen: true,
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

    describe('fetchRefundState', () => {
        const readContractSpy = jest.spyOn(wagmiActions, 'readContract');
        const slashingManager = '0x0000000000000000000000000000000000000005';
        const params = {
            chainId: 1,
            pluginAddress:
                '0x0000000000000000000000000000000000000003' as const,
            proposalId: BigInt(3),
            e3Id: BigInt(19),
        };

        const mockChain = (isCalculated: boolean) => {
            const results: Record<string, unknown> = {
                proposalPayer: '0x0000000000000000000000000000000000000001',
                interfold: '0x0000000000000000000000000000000000000002',
                getE3Stage: CrispE3Stage.FAILED,
                e3RefundManager: '0x0000000000000000000000000000000000000004',
                markFailedGracePeriod: BigInt(3600),
                getRefundDistribution: {
                    calculated: isCalculated,
                    requesterAmount: BigInt(isCalculated ? 100 : 0),
                },
                hasRequesterClaimed: false,
                getE3PolicySnapshot: { slashingManager },
                settlementOpen: false,
                accusationSubmissionDeadline: BigInt(1_794_000_000),
            };
            readContractSpy.mockImplementation(
                (_config, parameters) =>
                    Promise.resolve(results[parameters.functionName]) as never,
            );
        };

        afterEach(() => {
            readContractSpy.mockReset();
        });

        it('reads whether the failure can be processed from the slashing manager the round was requested under', async () => {
            mockChain(false);

            const state = await crispRefundUtils.fetchRefundState(params);

            expect(state.isSettlementOpen).toBe(false);
            expect(state.reportingDeadline).toEqual(1_794_000_000);
            const settlementCall = readContractSpy.mock.calls.find(
                ([, parameters]) =>
                    parameters.functionName === 'settlementOpen',
            );
            expect(settlementCall?.[1]).toMatchObject({
                address: slashingManager,
                args: [BigInt(19)],
            });
        });

        it('does not read the settlement once the refund is calculated', async () => {
            mockChain(true);

            const state = await crispRefundUtils.fetchRefundState(params);

            expect(state.isSettlementOpen).toBe(true);
            expect(
                readContractSpy.mock.calls.some(
                    ([, parameters]) =>
                        parameters.functionName === 'getE3PolicySnapshot',
                ),
            ).toBe(false);
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

    describe('getRefundWait', () => {
        const deadline = 1_793_917_932;
        const proposal = generateCrispProposal({ e3StageDeadline: deadline });

        it('waits for the grace period before anyone may mark the round failed', () => {
            const now = deadline * 1000;

            expect(
                crispRefundUtils.getRefundWait(
                    proposal,
                    buildState({ stage: CrispE3Stage.KEY_PUBLISHED }),
                    'markFailed',
                    now,
                ),
            ).toEqual({
                reason: 'graceRunning',
                until: (deadline + 3600) * 1000,
            });
        });

        it('lets the round be marked failed once the grace period ended', () => {
            const now = (deadline + 3601) * 1000;

            expect(
                crispRefundUtils.getRefundWait(
                    proposal,
                    buildState({ stage: CrispE3Stage.KEY_PUBLISHED }),
                    'markFailed',
                    now,
                ),
            ).toBeUndefined();
        });

        it('waits for the reporting window before the failure can be processed', () => {
            const state = buildState({
                isCalculated: false,
                isSettlementOpen: false,
                reportingDeadline: deadline + 604_800,
            });

            expect(
                crispRefundUtils.getRefundWait(
                    proposal,
                    state,
                    'processFailure',
                    deadline * 1000,
                ),
            ).toEqual({
                reason: 'reportingRunning',
                until: (deadline + 604_800) * 1000,
            });
        });

        it('waits without a date while reports stay open past the reporting window', () => {
            const state = buildState({
                isCalculated: false,
                isSettlementOpen: false,
                reportingDeadline: deadline,
            });

            expect(
                crispRefundUtils.getRefundWait(
                    proposal,
                    state,
                    'processFailure',
                    (deadline + 1) * 1000,
                ),
            ).toEqual({ reason: 'reportsOpen' });
        });

        it('processes the failure once settlement is open', () => {
            const state = buildState({ isCalculated: false });

            expect(
                crispRefundUtils.getRefundWait(
                    proposal,
                    state,
                    'processFailure',
                ),
            ).toBeUndefined();
        });
    });
});
