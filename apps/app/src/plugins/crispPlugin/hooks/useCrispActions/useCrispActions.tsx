'use client';

import type { IDaoPlugin } from '@/shared/api/daoService';
import { useTranslations } from '@/shared/components/translationsProvider';
import type { ICrispPluginSettings } from '../../types';
import { crispActionUtils } from '../../utils/crispActionUtils';

export const useCrispActions = (plugin: IDaoPlugin<ICrispPluginSettings>) => {
    const { t } = useTranslations();

    return crispActionUtils.getCrispActions({ plugin, t });
};
