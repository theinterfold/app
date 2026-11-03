'use client';

import { EmptyState } from '@aragon/gov-ui-kit';
import type { IVoteListProps } from '@/modules/governance/components/voteList';
import { useTranslations } from '@/shared/components/translationsProvider';

// Ballots are encrypted, so there are no individual votes to list.
export const CrispVoteList: React.FC<IVoteListProps> = () => {
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
