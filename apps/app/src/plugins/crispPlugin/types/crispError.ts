import type { ITFuncOptions } from '@/shared/utils/translationsUtils';

/**
 * Error raised outside React that the voter reads, carrying the translation key and parameters to
 * render it with, as the translation function is only available to components.
 */
export class CrispError extends Error {
    readonly errorKey: string;
    readonly params?: ITFuncOptions;

    constructor(
        errorKey: string,
        options?: { params?: ITFuncOptions; cause?: unknown },
    ) {
        super(errorKey, { cause: options?.cause });

        this.name = 'CrispError';
        this.errorKey = errorKey;
        this.params = options?.params;
    }
}
