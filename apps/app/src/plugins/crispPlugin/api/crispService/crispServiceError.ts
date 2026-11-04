/**
 * Error of a failed request to the CRISP server, carrying the reason the server gave. Error bodies
 * are not uniform (a JSON object with `message`, `response` or `error`, a bare JSON string or plain
 * text), so all are read, falling back to a sentence derived from the status.
 */
export class CrispServiceError extends Error {
    private static statusFallbacks: Record<number, string> = {
        400: 'The CRISP server rejected the request as invalid.',
        404: 'The CRISP server has no record of this request.',
        429: 'Too many requests to the CRISP server. Wait a moment and try again.',
        503: 'The CRISP server is temporarily unavailable. Try again shortly.',
        504: 'The CRISP server timed out. Try again.',
    };

    readonly status: number;

    constructor(message: string, status: number) {
        super(message);

        this.name = 'CrispServiceError';
        this.status = status;
    }

    static fromResponse = async (
        response: Response,
    ): Promise<CrispServiceError> => {
        const text = await response.text().catch(() => '');
        const message =
            CrispServiceError.parseMessage(text) ??
            CrispServiceError.statusFallbacks[response.status] ??
            `The CRISP server rejected the request (HTTP ${String(response.status)}).`;

        return new CrispServiceError(message, response.status);
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
