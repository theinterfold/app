import type { ICreateCrispProposalFormData } from '../crispTransactionUtils';
import { crispFeeUtils } from './crispFeeUtils';

describe('crispFeeUtils', () => {
    describe('shortfall', () => {
        it('returns the difference when the credit does not cover the quote', () => {
            expect(crispFeeUtils.shortfall(BigInt(100), BigInt(40))).toEqual(
                BigInt(60),
            );
        });

        it('returns zero when the credit exactly covers the quote', () => {
            expect(crispFeeUtils.shortfall(BigInt(100), BigInt(100))).toEqual(
                BigInt(0),
            );
        });

        it('returns zero instead of a negative amount when the creator is in surplus', () => {
            expect(crispFeeUtils.shortfall(BigInt(100), BigInt(250))).toEqual(
                BigInt(0),
            );
        });

        it.each([
            { quote: undefined, credit: BigInt(40) },
            { quote: BigInt(100), credit: undefined },
            { quote: undefined, credit: undefined },
        ])(
            'returns zero while a read is unknown ($quote, $credit)',
            ({ quote, credit }) => {
                expect(crispFeeUtils.shortfall(quote, credit)).toEqual(
                    BigInt(0),
                );
            },
        );
    });

    describe('depositAmount', () => {
        it('adds the buffer on top of the shortfall', () => {
            // 60 short, +10% = 66
            expect(
                crispFeeUtils.depositAmount(BigInt(100), BigInt(40)),
            ).toEqual(BigInt(66));
        });

        it('stays zero when there is nothing to top up, rather than depositing the buffer alone', () => {
            expect(
                crispFeeUtils.depositAmount(BigInt(100), BigInt(100)),
            ).toEqual(BigInt(0));
        });

        it('truncates rather than rounding up, matching integer token units', () => {
            // 5 short, +10% = 5.5 -> 5
            expect(crispFeeUtils.depositAmount(BigInt(5), BigInt(0))).toEqual(
                BigInt(5),
            );
        });
    });

    describe('hasSufficientCredit', () => {
        it('is true when the credit covers the quote', () => {
            expect(
                crispFeeUtils.hasSufficientCredit(BigInt(100), BigInt(100)),
            ).toBeTruthy();
        });

        it('is false when the credit falls short', () => {
            expect(
                crispFeeUtils.hasSufficientCredit(BigInt(100), BigInt(99)),
            ).toBeFalsy();
        });

        it.each([
            { quote: undefined, credit: BigInt(100) },
            { quote: BigInt(100), credit: undefined },
        ])(
            'is false while a read is unknown ($quote, $credit)',
            ({ quote, credit }) => {
                expect(
                    crispFeeUtils.hasSufficientCredit(quote, credit),
                ).toBeFalsy();
            },
        );
    });
});

describe('crispFeeUtils dates and quotes', () => {
    const now = 1_800_000_000;
    const defaultDuration = { days: 0, hours: 0, minutes: 15 };

    // The end date of a duration is computed from the wall clock.
    beforeEach(() => {
        jest.useFakeTimers({ now: now * 1000 });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const buildProposal = (
        form: Record<string, unknown> = {},
    ): ICreateCrispProposalFormData =>
        ({
            minimumDuration: defaultDuration,
            ...form,
        }) as unknown as ICreateCrispProposalFormData;

    describe('resolveProposalDates', () => {
        it('leaves both dates to the contract when the creator sets neither', () => {
            // No end date means the DAO minimum duration, not the app-wide seven days: the
            // creator pays for the window.
            expect(
                crispFeeUtils.resolveProposalDates({
                    proposal: buildProposal(),
                    now,
                }),
            ).toEqual({ startDate: 0, endDate: 0 });
        });

        it('leaves the end to the contract when the duration equals the minimum', () => {
            const proposal = buildProposal({
                startTimeMode: 'now',
                endTimeMode: 'duration',
                endTimeDuration: defaultDuration,
            });

            expect(
                crispFeeUtils.resolveProposalDates({ proposal, now }),
            ).toEqual({ startDate: 0, endDate: 0 });
        });

        it('sends the current time as the start of an explicit end, never zero', () => {
            // With start 0 and end > 0 the contract adds the end to the start as a duration, so
            // an absolute end timestamp would stretch the round across decades.
            const proposal = buildProposal({
                startTimeMode: 'now',
                endTimeMode: 'duration',
                endTimeDuration: { days: 1, hours: 0, minutes: 0 },
            });

            const { startDate, endDate } = crispFeeUtils.resolveProposalDates({
                proposal,
                now,
            });

            expect(startDate).toEqual(now);
            expect(endDate).toBeGreaterThan(0);
        });
    });

    describe('getQuoteCalls', () => {
        it('quotes the default window with zero dates, as the contract derives it', () => {
            expect(
                crispFeeUtils.getQuoteCalls({
                    proposal: buildProposal(),
                    now,
                }),
            ).toEqual([
                {
                    functionName: 'quoteProposalFee',
                    args: [BigInt(0), BigInt(0)],
                },
            ]);
        });

        it('quotes an explicit end with the same start the proposal is created with', () => {
            const proposal = buildProposal({
                startTimeMode: 'now',
                endTimeMode: 'duration',
                endTimeDuration: { days: 1, hours: 0, minutes: 0 },
            });
            const { startDate, endDate } = crispFeeUtils.resolveProposalDates({
                proposal,
                now,
            });

            expect(crispFeeUtils.getQuoteCalls({ proposal, now })).toEqual([
                {
                    functionName: 'quoteProposalFee',
                    args: [BigInt(startDate), BigInt(endDate)],
                },
            ]);
        });

        it('prices a body of a staged process by its stage windows, whatever the form says', () => {
            const proposal = buildProposal({
                startTimeMode: 'now',
                endTimeMode: 'duration',
                endTimeDuration: { days: 9, hours: 0, minutes: 0 },
            });

            expect(
                crispFeeUtils.getQuoteCalls({
                    proposal,
                    now,
                    stageDurations: [600, 3600],
                }),
            ).toEqual([
                {
                    functionName: 'quoteProposalFeeForDuration',
                    args: [BigInt(600)],
                },
                {
                    functionName: 'quoteProposalFeeForDuration',
                    args: [BigInt(3600)],
                },
            ]);
        });
    });

    describe('sumQuotes', () => {
        it('adds up the quotes of every proposal paid from the same escrow', () => {
            expect(crispFeeUtils.sumQuotes([BigInt(100), BigInt(250)])).toEqual(
                BigInt(350),
            );
        });

        it('is unknown when any quote is unknown, as a partial sum under-funds the escrow', () => {
            expect(
                crispFeeUtils.sumQuotes([BigInt(100), undefined]),
            ).toBeUndefined();
            expect(crispFeeUtils.sumQuotes([])).toBeUndefined();
        });
    });
});
