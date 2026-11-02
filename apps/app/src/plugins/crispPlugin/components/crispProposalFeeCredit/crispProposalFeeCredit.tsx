'use client';

import {
    AlertInline,
    Button,
    Card,
    DefinitionList,
    formatterUtils,
    NumberFormat,
} from '@aragon/gov-ui-kit';
import { formatUnits, type Hex } from 'viem';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import type { IDaoPlugin } from '@/shared/api/daoService';
import { useDialogContext } from '@/shared/components/dialogProvider';
import { useTranslations } from '@/shared/components/translationsProvider';
import { CrispPluginDialogId } from '../../constants/crispPluginDialogId';
import type { ICrispWithdrawCreditDialogParams } from '../../dialogs/crispWithdrawCreditDialog';
import { useCrispFeeCredits } from '../../hooks/useCrispFeeCredits';
import type { ICrispPluginSettings } from '../../types';
import type { ICrispQuoteCall } from '../../utils/crispFeeUtils';

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
 * Displays the E3 fee of a CRISP proposal and the fee credit of the creator on the plugin, and
 * lets them top it up or withdraw it.
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
        depositShortfall,
        isDepositing,
        isLoading,
        quoteError,
        depositFailure,
        refetchCredit,
    } = useCrispFeeCredits({
        pluginAddress: plugin.address,
        network,
        quoteCalls,
    });

    const format = (value?: bigint) =>
        value == null || decimals == null
            ? '-'
            : (formatterUtils.formatNumber(formatUnits(value, decimals), {
                  format: NumberFormat.TOKEN_AMOUNT_SHORT,
              }) ?? '-');

    const withSymbol = (value?: bigint) =>
        `${format(value)} ${symbol ?? ''}`.trim();

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
                    {isLoading ? '-' : withSymbol(quote)}
                </DefinitionList.Item>
                <DefinitionList.Item
                    term={t('app.plugins.crisp.crispProposalFeeCredit.credit')}
                >
                    {address == null || isLoading ? '-' : withSymbol(credit)}
                </DefinitionList.Item>
            </DefinitionList.Container>

            {address != null && !isLoading && !hasSufficientCredit && (
                <>
                    <AlertInline
                        message={t(
                            'app.plugins.crisp.crispProposalFeeCredit.shortfall',
                        )}
                        variant="warning"
                    />
                    <Button
                        className="w-fit"
                        isLoading={isDepositing}
                        onClick={() => void depositShortfall()}
                        size="md"
                    >
                        {t(
                            'app.plugins.crisp.crispProposalFeeCredit.buttons.deposit',
                        )}
                    </Button>
                </>
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

            {depositFailure != null && (
                <AlertInline
                    message={t(
                        `app.plugins.crisp.crispProposalFeeCredit.error.${depositFailure === 'transaction' ? 'deposit' : depositFailure}`,
                        { symbol },
                    )}
                    variant="critical"
                />
            )}
        </Card>
    );
};
