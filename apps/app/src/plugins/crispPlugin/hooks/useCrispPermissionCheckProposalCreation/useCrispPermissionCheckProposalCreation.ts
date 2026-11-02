import { formatterUtils, NumberFormat } from '@aragon/gov-ui-kit';
import { formatUnits } from 'viem';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import { useMember } from '@/modules/governance/api/governanceService';
import type {
    IPermissionCheckGuardParams,
    IPermissionCheckGuardResult,
} from '@/modules/governance/types';
import type { ITokenMember } from '@/plugins/tokenPlugin/types';
import { useDao } from '@/shared/api/daoService';
import { useTranslations } from '@/shared/components/translationsProvider';
import { bigIntUtils } from '@/shared/utils/bigIntUtils';
import { daoUtils } from '@/shared/utils/daoUtils';
import type { ICrispPlugin } from '../../types';

export interface ICrispPermissionCheckProposalCreationParams
    extends IPermissionCheckGuardParams<ICrispPlugin> {}

export const useCrispPermissionCheckProposalCreation = (
    params: ICrispPermissionCheckProposalCreationParams,
): IPermissionCheckGuardResult => {
    const { plugin, daoId, useConnectedUserInfo = true } = params;

    const { address } = useWalletAccount();
    const { t } = useTranslations();

    const { data: dao } = useDao({ urlParams: { id: daoId } });

    const pluginName = daoUtils.getPluginName(plugin);
    const { minProposerVotingPower, token } = plugin.settings;
    const { decimals: tokenDecimals, symbol: tokenSymbol } = token;

    const parsedMinVotingPower = formatUnits(
        bigIntUtils.safeParse(minProposerVotingPower),
        tokenDecimals,
    );
    const formattedMinVotingPower = formatterUtils.formatNumber(
        parsedMinVotingPower,
        { format: NumberFormat.TOKEN_AMOUNT_SHORT },
    );

    const memberUrlParams = { address: address as string };
    const memberQueryParams = {
        daoId,
        pluginAddress: plugin.address,
        tokenAddress: token.address,
        network: dao?.network,
    };
    const { data: member, isLoading } = useMember<ITokenMember>(
        { urlParams: memberUrlParams, queryParams: memberQueryParams },
        { enabled: address != null },
    );

    const userVotingPower = bigIntUtils.safeParse(member?.votingPower);
    const parsedMemberVotingPower = formatUnits(userVotingPower, tokenDecimals);
    const formattedMemberVotingPower = formatterUtils.formatNumber(
        parsedMemberVotingPower,
        { format: NumberFormat.TOKEN_AMOUNT_SHORT },
    );

    const defaultSettings = [
        {
            term: t(
                'app.plugins.crisp.crispPermissionCheckProposalCreation.pluginNameLabel',
            ),
            definition: pluginName,
        },
        {
            term: t(
                'app.plugins.crisp.crispPermissionCheckProposalCreation.function',
            ),
            definition: `≥${formattedMinVotingPower ?? '0'} ${tokenSymbol}`,
        },
    ];

    const connectedUserSettings = [
        {
            term: t(
                'app.plugins.crisp.crispPermissionCheckProposalCreation.userVotingPower',
            ),
            definition: `${formattedMemberVotingPower ?? '0'} ${tokenSymbol}`,
        },
    ];

    const processedSettings = useConnectedUserInfo
        ? defaultSettings.concat(connectedUserSettings)
        : defaultSettings;

    const minVotingPower = bigIntUtils.safeParse(minProposerVotingPower);
    const isRestricted = minVotingPower > BigInt(0);

    return {
        hasPermission: userVotingPower >= minVotingPower,
        settings: [processedSettings],
        isLoading,
        isRestricted,
    };
};
