import { generateResponse } from '@/shared/testUtils';
import { CrispServiceError } from './crispServiceError';

const buildResponse = (status: number, body = '') =>
    generateResponse({ status, text: () => Promise.resolve(body) });

describe('CrispServiceError', () => {
    describe('fromResponse', () => {
        it('reads the message of a ballot rejection', async () => {
            const response = buildResponse(
                429,
                JSON.stringify({
                    status: 'failed_broadcast',
                    message: 'Too many votes from this address, slow down',
                }),
            );

            const error = await CrispServiceError.fromResponse(response);

            expect(error.message).toEqual(
                'Too many votes from this address, slow down',
            );
            expect(error.status).toEqual(429);
        });

        it('reads the response field of a state route', async () => {
            const response = buildResponse(
                404,
                JSON.stringify({
                    response:
                        'Round 7 is indexed, but verified committee public-key bytes are not available yet',
                }),
            );

            const error = await CrispServiceError.fromResponse(response);

            expect(error.message).toMatch(/not available yet/);
            expect(CrispServiceError.isNotFoundError(error)).toBe(true);
        });

        it('reads a bare JSON string and a plain text body', async () => {
            const json = await CrispServiceError.fromResponse(
                buildResponse(400, JSON.stringify('Invalid round id')),
            );
            const text = await CrispServiceError.fromResponse(
                buildResponse(503, 'Service unavailable'),
            );

            expect(json.message).toEqual('Invalid round id');
            expect(text.message).toEqual('Service unavailable');
        });

        it('falls back to a sentence derived from the status for an empty body', async () => {
            const notFound = await CrispServiceError.fromResponse(
                buildResponse(404),
            );
            const unknown = await CrispServiceError.fromResponse(
                buildResponse(418),
            );

            expect(notFound.message).toMatch(/no record/);
            expect(unknown.message).toMatch(/HTTP 418/);
        });
    });

    describe('isNotFoundError', () => {
        it('only matches a 404 of the CRISP server', () => {
            expect(
                CrispServiceError.isNotFoundError(
                    new CrispServiceError('x', 404),
                ),
            ).toBe(true);
            expect(
                CrispServiceError.isNotFoundError(
                    new CrispServiceError('x', 503),
                ),
            ).toBe(false);
            expect(CrispServiceError.isNotFoundError(new Error('x'))).toBe(
                false,
            );
        });
    });
});
