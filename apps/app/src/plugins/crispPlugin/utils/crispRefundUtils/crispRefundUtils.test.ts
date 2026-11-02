import { crispE3StageFailed } from '../../constants/crispInterfoldAbi';
import { crispRefundUtils, type ICrispRefundState } from './crispRefundUtils';

describe('crispRefund utils', () => {
    const buildState = (
        overrides?: Partial<ICrispRefundState>,
    ): ICrispRefundState => ({
        payer: '0x0000000000000000000000000000000000000001',
        interfold: '0x0000000000000000000000000000000000000002',
        stage: crispE3StageFailed,
        isCalculated: true,
        amount: BigInt(100),
        isClaimed: false,
        ...overrides,
    });

    describe('getRefundStep', () => {
        it('marks a round that missed a deadline as failed first', () => {
            const state = buildState({ stage: 3, isCalculated: false });

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
});
