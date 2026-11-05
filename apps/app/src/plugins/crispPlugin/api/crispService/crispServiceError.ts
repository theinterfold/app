import type { ITFuncOptions } from '@/shared/utils/translationsUtils';
import { CrispError } from '../../types';

/**
 * Error of a failed request to the CRISP server, carrying the reason the server gave. Error bodies
 * are not uniform (a JSON object with `message`, `response` or `error`, a bare JSON string or plain
 * text), so all are read, falling back to a sentence derived from the status.
 */
export class CrispServiceError extends CrispError {
    private static statusFallbacks: Record<number, string> = {
        400: 'app.plugins.crisp.crispSubmitVoteDialog.error.serverInvalidRequest',
        404: 'app.plugins.crisp.crispSubmitVoteDialog.error.serverNotFound',
        429: 'app.plugins.crisp.crispSubmitVoteDialog.error.serverRateLimited',
        503: 'app.plugins.crisp.crispSubmitVoteDialog.error.serverUnavailable',
        504: 'app.plugins.crisp.crispSubmitVoteDialog.error.serverTimeout',
    };

    readonly status: number;

    constructor(errorKey: string, status: number, params?: ITFuncOptions) {
        super(errorKey, { params });

        this.name = 'CrispServiceError';
        this.status = status;
    }

    static fromResponse = async (
        response: Response,
    ): Promise<CrispServiceError> => {
        const text = await response.text().catch(() => '');
        const reason = CrispServiceError.parseMessage(text);

        if (reason != null) {
            return new CrispServiceError(
                'app.plugins.crisp.crispSubmitVoteDialog.error.serverReason',
                response.status,
                { reason },
            );
        }

        return new CrispServiceError(
            CrispServiceError.statusFallbacks[response.status] ??
                'app.plugins.crisp.crispSubmitVoteDialog.error.serverRejected',
            response.status,
            { status: response.status },
        );
    };

    static isNotFoundError = (error: unknown): error is CrispServiceError =>
        error instanceof CrispServiceError && error.status === 404;

    // A failure the server may answer differently later: no response at all, rate limiting or a
    // server-side error. Any other rejection stands.
    static isTransientError = (error: unknown): boolean =>
        !(error instanceof CrispServiceError) ||
        error.status === 429 ||
        error.status >= 500;

    private static parseMessage = (body: string): string | undefined => {
        let parsed: unknown = body;

        try {
            parsed = JSON.parse(body);
        } catch {
            // Plain text body, used as is.
        }

        const { message, response, error } = (
            parsed != null && typeof parsed === 'object' ? parsed : {}
        ) as Record<string, unknown>;
        const candidates =
            typeof parsed === 'object' ? [message, response, error] : [parsed];

        return candidates
            .find(
                (value): value is string =>
                    typeof value === 'string' && value.trim().length > 0,
            )
            ?.trim();
    };
}
