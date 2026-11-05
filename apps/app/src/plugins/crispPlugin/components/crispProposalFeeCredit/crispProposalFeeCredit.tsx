'use client';

import { AlertInline, Button, Card, DefinitionList } from '@aragon/gov-ui-kit';
import type { Hex } from 'viem';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import type { IDaoPlugin } from '@/shared/api/daoService';
import { useDialogContext } from '@/shared/components/dialogProvider';
import { useTranslations } from '@/shared/components/translationsProvider';
import { CrispPluginDialogId } from '../../constants/crispPluginDialogId';
import type { ICrispWithdrawCreditDialogParams } from '../../dialogs/crispWithdrawCreditDialog';
import { useCrispFeeCredits } from '../../hooks/useCrispFeeCredits';
import type { ICrispPluginSettings } from '../../types';
import { crispFeeUtils, type ICrispQuoteCall } from '../../utils/crispFeeUtils';

export interface ICrispProposalFeeCreditProps {
    /**
     * CRISP plugin the proposal is being created on.
     */
    plugin: IDaoPlugin<ICrispPluginSettings>;
    /**
     * Quote calls pricing the proposal about to be created, see `crispFeeUtils.getQuoteCalls`.
     */
    quoteCalls: ICrispQuoteCall[];
}

/**
 * Displays the E3 fee of a CRISP proposal and the fee credit of the creator on the plugin, the
 * amount the publish dialog deposits when the credit falls short, and lets the creator withdraw
 * their credit.
 */
export const CrispProposalFeeCredit: React.FC<ICrispProposalFeeCreditProps> = (
    props,
) => {
    const { plugin, quoteCalls } = props;

    const { t } = useTranslations();
    const { address } = useWalletAccount();
    const { open } = useDialogContext();

    const network = plugin.settings.token.network;

    const {
        quote,
        credit,
        decimals,
        symbol,
        hasSufficientCredit,
        depositAmount,
        isLoading,
        quoteError,
        refetchCredit,
    } = useCrispFeeCredits({
        pluginAddress: plugin.address,
        network,
        quoteCalls,
    });

    const format = (value?: bigint) =>
        crispFeeUtils.formatAmount(value, decimals, symbol);

    const handleWithdraw = (
        amount: bigint,
        decimals: number,
        symbol: string,
    ) => {
        const params: ICrispWithdrawCreditDialogParams = {
            network,
            pluginAddress: plugin.address as Hex,
            amount,
            decimals,
            symbol,
            onSuccess: () => void refetchCredit(),
        };
        open(CrispPluginDialogId.WITHDRAW_CREDIT, { params });
    };

    if (quoteError != null) {
        return (
            <AlertInline
                message={t(
                    'app.plugins.crisp.crispProposalFeeCredit.error.quote',
                )}
                variant="critical"
            />
        );
    }

    return (
        <Card className="flex flex-col gap-4 p-6">
            <DefinitionList.Container>
                <DefinitionList.Item
                    term={t('app.plugins.crisp.crispProposalFeeCredit.fee')}
                >
                    {isLoading ? '-' : format(quote)}
                </DefinitionList.Item>
                <DefinitionList.Item
                    term={t('app.plugins.crisp.crispProposalFeeCredit.credit')}
                >
                    {address == null || isLoading ? '-' : format(credit)}
                </DefinitionList.Item>
            </DefinitionList.Container>

            {address != null &&
                !isLoading &&
                !hasSufficientCredit &&
                depositAmount != null &&
                depositAmount > BigInt(0) && (
                    <AlertInline
                        message={t(
                            'app.plugins.crisp.crispProposalFeeCredit.deposit',
                            { amount: format(depositAmount) },
                        )}
                        variant="info"
                    />
                )}

            {address != null &&
                !isLoading &&
                credit != null &&
                credit > BigInt(0) &&
                decimals != null &&
                symbol != null && (
                    <Button
                        className="w-fit"
                        onClick={() => handleWithdraw(credit, decimals, symbol)}
                        size="md"
                        variant="secondary"
                    >
                        {t(
                            'app.plugins.crisp.crispProposalFeeCredit.buttons.withdraw',
                        )}
                    </Button>
                )}
        </Card>
    );
};
