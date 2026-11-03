'use client';

import { invariant } from '@aragon/gov-ui-kit';
import { encodeFunctionData, type Hex } from 'viem';
import type { Network } from '@/shared/api/daoService';
import type { IDialogComponentProps } from '@/shared/components/dialogProvider';
import {
    type ITransactionDialogStepMeta,
    TransactionDialog,
    TransactionDialogStep,
} from '@/shared/components/transactionDialog';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useStepper } from '@/shared/hooks/useStepper';
import { crispInterfoldAbi } from '../../constants/crispInterfoldAbi';
import type { CrispRefundStep } from '../../utils/crispRefundUtils';
import { crispPluginAbi } from '../../utils/crispTransactionUtils/crispPluginAbi';

export interface ICrispRefundDialogParams {
    /**
     * Network of the plugin.
     */
    network: Network;
    /**
     * Address of the CRISP plugin.
     */
    pluginAddress: Hex;
    /**
     * Id of the proposal whose fee is refunded.
     */
    proposalId: bigint;
    /**
     * Id of the failed Interfold round of the proposal.
     */
    e3Id: bigint;
    /**
     * Interfold coordinator of the round.
     */
    interfold: Hex;
    /**
     * Transaction to send, see `crispRefundUtils.getRefundStep`.
     */
    step: CrispRefundStep;
    /**
     * Callback triggered once the transaction is confirmed.
     */
    onSuccess?: () => void;
}

export interface ICrispRefundDialogProps
    extends IDialogComponentProps<ICrispRefundDialogParams> {}

export const CrispRefundDialog: React.FC<ICrispRefundDialogProps> = (props) => {
    const { location } = props;
    invariant(
        location.params != null,
        'CrispRefundDialog: required parameters must be set.',
    );

    const {
        network,
        pluginAddress,
        proposalId,
        e3Id,
        interfold,
        step,
        onSuccess,
    } = location.params;

    const { t } = useTranslations();

    const stepper = useStepper<
        ITransactionDialogStepMeta,
        TransactionDialogStep
    >({ initialActiveStep: TransactionDialogStep.PREPARE });

    const prepareTransaction = () => {
        const value = BigInt(0);

        if (step === 'claim') {
            const data = encodeFunctionData({
                abi: crispPluginAbi,
                functionName: 'claimRefund',
                args: [proposalId],
            });

            return Promise.resolve({ to: pluginAddress, data, value });
        }

        const data = encodeFunctionData({
            abi: crispInterfoldAbi,
            functionName:
                step === 'markFailed' ? 'markE3Failed' : 'processE3Failure',
            args: [e3Id],
        });

        return Promise.resolve({ to: interfold, data, value });
    };

    const translationKey = `app.plugins.crisp.crispRefundDialog.${step}`;

    return (
        <TransactionDialog
            description={t(`${translationKey}.description`)}
            network={network}
            onSuccess={onSuccess}
            prepareTransaction={prepareTransaction}
            stepper={stepper}
            submitLabel={t(`${translationKey}.submit`)}
            successLink={{
                label: t('app.plugins.crisp.crispRefundDialog.success'),
            }}
            title={t(`${translationKey}.title`)}
        />
    );
};
