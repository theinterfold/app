import { renderHook } from '@testing-library/react';
import { parseUnits } from 'viem';
import type { IDaoPlugin } from '@/shared/api/daoService';
import * as useDaoPluginsModule from '@/shared/hooks/useDaoPlugins';
import { generateDaoPlugin } from '@/shared/testUtils';
import * as useCrispFeeCreditsModule from '../../hooks/useCrispFeeCredits';
import type { IUseCrispFeeCreditsResult } from '../../hooks/useCrispFeeCredits/useCrispFeeCredits.api';
import { generateCrispPluginSettings } from '../../testUtils';
import type { ICrispPluginSettings } from '../../types';
import { crispFeeUtils } from '../../utils/crispFeeUtils';
import type { ICreateCrispProposalFormData } from '../../utils/crispTransactionUtils';
import { useCrispCreateProposalPrerequisiteSteps } from './useCrispCreateProposalPrerequisiteSteps';

describe('useCrispCreateProposalPrerequisiteSteps hook', () => {
    const useDaoPluginsSpy = jest.spyOn(useDaoPluginsModule, 'useDaoPlugins');
    const useCrispFeeCreditsSpy = jest.spyOn(
        useCrispFeeCreditsModule,
        'useCrispFeeCredits',
    );
    const getQuoteCallsSpy = jest.spyOn(crispFeeUtils, 'getQuoteCalls');

    const plugin: IDaoPlugin<ICrispPluginSettings> = generateDaoPlugin({
        address: '0x00000000000000000000000000000000000000c3',
        settings: generateCrispPluginSettings(),
    });

    const feeCredits = (
        values?: Partial<IUseCrispFeeCreditsResult>,
    ): IUseCrispFeeCreditsResult => ({
        hasSufficientCredit: false,
        depositAmount: parseUnits('12.5', 18),
        decimals: 18,
        symbol: 'FOLD',
        depositShortfall: jest.fn(),
        isLoading: false,
        refetchCredit: jest.fn(),
        ...values,
    });

    const renderSteps = () =>
        renderHook(() =>
            useCrispCreateProposalPrerequisiteSteps({
                daoId: 'dao-id',
                plugin,
                proposal: {} as ICreateCrispProposalFormData,
                onSuccess: jest.fn(),
            }),
        );

    beforeEach(() => {
        useDaoPluginsSpy.mockReturnValue(undefined);
        getQuoteCallsSpy.mockReturnValue([]);
    });

    afterEach(() => {
        useDaoPluginsSpy.mockReset();
        useCrispFeeCreditsSpy.mockReset();
        getQuoteCallsSpy.mockReset();
    });

    it('names the amount it deposits, and keeps it once the deposit covers the fee', () => {
        useCrispFeeCreditsSpy.mockReturnValue(feeCredits());
        const { result, rerender } = renderSteps();

        expect(result.current.steps[0].meta.label).toMatch(
            /DEPOSIT_FEE\.label \(amount=12\.5 FOLD\)/,
        );

        useCrispFeeCreditsSpy.mockReturnValue(
            feeCredits({ hasSufficientCredit: true, depositAmount: BigInt(0) }),
        );
        rerender();

        expect(result.current.steps).toHaveLength(1);
        expect(result.current.steps[0].meta.label).toMatch(
            /DEPOSIT_FEE\.label \(amount=12\.5 FOLD\)/,
        );
    });

    it('tells why the deposit failed', () => {
        useCrispFeeCreditsSpy.mockReturnValue(
            feeCredits({ depositFailure: 'balance' }),
        );
        const { result } = renderSteps();

        expect(result.current.steps[0].meta.errorLabel).toMatch(
            /DEPOSIT_FEE\.errorLabel\.balance \(symbol=FOLD\)/,
        );
    });

    it('does not name an amount it could not read', () => {
        useCrispFeeCreditsSpy.mockReturnValue(
            feeCredits({ depositAmount: undefined }),
        );
        const { result } = renderSteps();

        expect(result.current.steps[0].meta.label).toMatch(
            /DEPOSIT_FEE\.labelUnknownAmount$/,
        );
    });

    it('contributes no step when the credit covers the fee', () => {
        useCrispFeeCreditsSpy.mockReturnValue(
            feeCredits({ hasSufficientCredit: true, depositAmount: BigInt(0) }),
        );
        const { result } = renderSteps();

        expect(result.current.steps).toEqual([]);
        expect(result.current.isResolved).toBe(true);
    });
});
