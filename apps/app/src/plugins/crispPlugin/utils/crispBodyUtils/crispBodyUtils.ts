'use client';

import type { ICompositeAddress } from '@aragon/gov-ui-kit';
import type { ISetupBodyFormExisting } from '@/modules/createDao/dialogs/setupBodyDialog';
import { daoProcessDetailsClientUtils } from '@/modules/settings/pages/daoProcessDetailsPage';
import type { IPluginToFormDataParams } from '@/modules/settings/types';
import type { ITokenSetupMembershipForm } from '@/plugins/tokenPlugin/components/tokenSetupMembership';
import type { ICrispPluginSettings } from '../../types';

export interface ICrispPluginToFormDataParams
    extends IPluginToFormDataParams<ICrispPluginSettings> {}

class CrispBodyUtils {
    pluginToFormData = (
        params: ICrispPluginToFormDataParams,
    ): ISetupBodyFormExisting<
        ICrispPluginSettings,
        ICompositeAddress,
        ITokenSetupMembershipForm
    > => {
        const { plugin } = params;

        return daoProcessDetailsClientUtils.bodyToFormDataDefault<
            ICrispPluginSettings,
            ITokenSetupMembershipForm
        >({
            plugin,
            membership: { members: [], token: plugin.settings.token },
        });
    };
}

export const crispBodyUtils = new CrispBodyUtils();
