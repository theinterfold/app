import { QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { Network } from '@/shared/api/daoService';
import { ReactQueryWrapper } from '@/shared/testUtils';
import { crispService } from '../../api/crispService';
import { useCrispRound } from './useCrispRound';

describe('useCrispRound', () => {
    const getRoundStateSpy = jest.spyOn(crispService, 'getRoundState');

    const buildWrapper = (client: QueryClient) =>
        function Wrapper({ children }: { children?: React.ReactNode }) {
            return (
                <ReactQueryWrapper client={client}>
                    {children}
                </ReactQueryWrapper>
            );
        };

    // The interval of the query, as the hook resolves it from the last answer of the server
    const getRefetchInterval = (client: QueryClient) => {
        const [query] = client.getQueryCache().findAll();
        const options = query.options as {
            refetchInterval?: (query: unknown) => number | false;
        };

        return options.refetchInterval?.(query);
    };

    afterEach(() => {
        getRoundStateSpy.mockReset();
    });

    const renderRound = async (status: string, committeeKey: number[]) => {
        const client = new QueryClient();
        getRoundStateSpy.mockResolvedValue({
            status,
            committee_public_key: committeeKey,
        });

        const { result } = renderHook(
            () =>
                useCrispRound({ network: Network.ETHEREUM_SEPOLIA, e3Id: '7' }),
            { wrapper: buildWrapper(client) },
        );
        await waitFor(() => {
            expect(result.current.roundState).toBeDefined();
        });

        return { client, result };
    };

    it('keeps polling while the committee has not published its key', async () => {
        const { client, result } = await renderRound('Active', []);

        expect(result.current.isRoundReady).toBe(false);
        expect(getRefetchInterval(client)).toEqual(10_000);
    });

    it('keeps polling while the round is only requested', async () => {
        const { client } = await renderRound('Requested', []);

        expect(getRefetchInterval(client)).toEqual(10_000);
    });

    it('stops polling once the round accepts ballots', async () => {
        const { client, result } = await renderRound('Active', [1]);

        expect(result.current.isRoundReady).toBe(true);
        expect(getRefetchInterval(client)).toBe(false);
    });

    it.each(['Expired', 'Computing', 'PublishingCiphertext', 'Finished'])(
        'stops polling once the round is %s, as it can no longer accept ballots',
        async (status) => {
            const { client, result } = await renderRound(status, []);

            expect(result.current.isRoundReady).toBe(false);
            expect(getRefetchInterval(client)).toBe(false);
        },
    );
});
