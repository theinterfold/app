'use client';

import { invariant } from '@aragon/gov-ui-kit';
import { encodeFunctionData, formatUnits, type Hex } from 'viem';
import type { Network } from '@/shared/api/daoService';
import type { IDialogComponentProps } from '@/shared/components/dialogProvider';
import {
    type ITransactionDialogStepMeta,
    TransactionDialog,
    TransactionDialogStep,
} from '@/shared/components/transactionDialog';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useStepper } from '@/shared/hooks/useStepper';
import { crispPluginAbi } from '../../utils/crispTransactionUtils/crispPluginAbi';

export interface ICrispWithdrawCreditDialogParams {
    /**
     * Network of the plugin.
     */
    network: Network;
    /**
     * Address of the CRISP plugin holding the credit.
     */
    pluginAddress: Hex;
    /**
     * Credit to withdraw, in fee-token units.
     */
    amount: bigint;
    /**
     * Decimals of the fee token.
     */
    decimals: number;
    /**
     * Symbol of the fee token.
     */
    symbol: string;
    /**
     * Callback triggered once the transaction is confirmed.
     */
    onSuccess?: () => void;
}

export interface ICrispWithdrawCreditDialogProps
    extends IDialogComponentProps<ICrispWithdrawCreditDialogParams> {}

export const CrispWithdrawCreditDialog: React.FC<
    ICrispWithdrawCreditDialogProps
> = (props) => {
    const { location } = props;
    invariant(
        location.params != null,
        'CrispWithdrawCreditDialog: required parameters must be set.',
    );

    const { network, pluginAddress, amount, decimals, symbol, onSuccess } =
        location.params;

    const { t } = useTranslations();

    const stepper = useStepper<
        ITransactionDialogStepMeta,
        TransactionDialogStep
    >({ initialActiveStep: TransactionDialogStep.PREPARE });

    const prepareTransaction = () => {
        const data = encodeFunctionData({
            abi: crispPluginAbi,
            functionName: 'withdraw',
            args: [amount],
        });

        return Promise.resolve({ to: pluginAddress, data, value: BigInt(0) });
    };

    return (
        <TransactionDialog
            description={t(
                'app.plugins.crisp.crispWithdrawCreditDialog.description',
                { amount: formatUnits(amount, decimals), symbol },
            )}
            network={network}
            onSuccess={onSuccess}
            prepareTransaction={prepareTransaction}
            stepper={stepper}
            submitLabel={t(
                'app.plugins.crisp.crispWithdrawCreditDialog.submit',
            )}
            successLink={{
                label: t('app.plugins.crisp.crispWithdrawCreditDialog.success'),
            }}
            title={t('app.plugins.crisp.crispWithdrawCreditDialog.title')}
        />
    );
};
