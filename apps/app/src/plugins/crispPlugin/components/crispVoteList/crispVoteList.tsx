'use client';

import { EmptyState } from '@aragon/gov-ui-kit';
import type { IGetVoteListParams } from '@/modules/governance/api/governanceService';
import type { IVoteListProps } from '@/modules/governance/components/voteList';
import { useTranslations } from '@/shared/components/translationsProvider';

export interface ICrispVoteListProps extends IVoteListProps {
    /**
     * Parameters to use for fetching votes.
     */
    initialParams: IGetVoteListParams;
}

// CRISP ballots are encrypted and broadcast off-chain, individual votes are never public.
export const CrispVoteList: React.FC<ICrispVoteListProps> = () => {
    const { t } = useTranslations();

    return (
        <EmptyState
            description={t(
                'app.plugins.crisp.crispVoteList.emptyState.description',
            )}
            heading={t('app.plugins.crisp.crispVoteList.emptyState.heading')}
            isStacked={false}
            objectIllustration={{ object: 'TIMELOCK' }}
        />
    );
};
