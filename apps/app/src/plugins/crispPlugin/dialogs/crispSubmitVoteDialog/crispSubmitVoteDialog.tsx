'use client';

import {
    AlertInline,
    ChainEntityType,
    Dialog,
    InputContainer,
    invariant,
    Switch,
    Toggle,
    ToggleGroup,
} from '@aragon/gov-ui-kit';
import { useEffect, useState } from 'react';
import type { VoteOption } from '@/plugins/tokenPlugin/types';
import {
    type IDialogComponentProps,
    useDialogContext,
} from '@/shared/components/dialogProvider';
import {
    type ITransactionStatusStepMeta,
    TransactionStatus,
    type TransactionStatusState,
} from '@/shared/components/transactionStatus';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useDaoChain } from '@/shared/hooks/useDaoChain';
import { useCrispProposal } from '../../hooks/useCrispProposal';
import {
    CrispSubmitVoteStep,
    useCrispSubmitVote,
} from '../../hooks/useCrispSubmitVote';
import {
    CrispError,
    CrispMaskTarget,
    CrispSubmitVoteMethod,
    type ICrispProposal,
} from '../../types';

interface ICrispSubmitVoteDialogVoteParams {
    /**
     * Proposal to submit the vote for.
     */
    proposal: ICrispProposal;
    /**
     * Selected vote option.
     */
    voteOption: VoteOption;
    maskTarget?: undefined;
}

interface ICrispSubmitVoteDialogMaskParams {
    /**
     * Proposal to submit the mask for.
     */
    proposal: ICrispProposal;
    /**
     * Whose slot the mask is written to.
     */
    maskTarget: CrispMaskTarget;
    /**
     * ID of the DAO the CRISP body belongs to, whose members a random target is drawn from.
     */
    daoId: string;
    voteOption?: undefined;
}

export type ICrispSubmitVoteDialogParams =
    | ICrispSubmitVoteDialogVoteParams
    | ICrispSubmitVoteDialogMaskParams;

export interface ICrispSubmitVoteDialogProps
    extends IDialogComponentProps<ICrispSubmitVoteDialogParams> {}

const stepOrder = Object.values(CrispSubmitVoteStep);

/**
 * Runs the encrypted ballot flow: the ballot is encrypted, signed and proved in the browser, then
 * staged with the CRISP server, which either relays it or hands it back for the voter to submit
 * themselves. A mask takes the same path without the signing step.
 */
export const CrispSubmitVoteDialog: React.FC<ICrispSubmitVoteDialogProps> = (
    props,
) => {
    const { location } = props;
    invariant(
        location.params != null,
        'CrispSubmitVoteDialog: required parameters must be set.',
    );

    const { proposal: proposalParam, maskTarget } = location.params;

    const { t } = useTranslations();
    const { close } = useDialogContext();

    const [method, setMethod] = useState<CrispSubmitVoteMethod>(
        CrispSubmitVoteMethod.RELAY,
    );

    const [randomizeWeight, setRandomizeWeight] = useState(true);

    // The e3 round of the proposal only exists on-chain.
    const { proposal, isLoading: isProposalLoading } = useCrispProposal({
        proposal: proposalParam,
    });

    const { buildEntityUrl } = useDaoChain({ network: proposal.network });

    const {
        submitVote,
        activeStep,
        state,
        transactionHash,
        error,
        isRoundReady,
        roundError,
        hasActiveSlot,
        isVoteUpdate,
        isMask,
        isWalletSubmission,
        countedShare,
        isLoading,
    } = useCrispSubmitVote({
        ...location.params,
        proposal,
        method,
        randomizeWeight,
    });

    const isPending = state === 'pending';

    // Wallet and chain failures keep the message they come with, only CRISP errors are translated
    const describeError = (cause: Error) =>
        cause instanceof CrispError
            ? t(cause.errorKey, cause.params)
            : cause.message;

    const isDirect = method === CrispSubmitVoteMethod.DIRECT;

    // The sender of a mask for a random member would not be its slot, which tells it from a vote,
    // so it is only ever relayed and the voter has no choice to make.
    const canChooseMethod = maskTarget !== CrispMaskTarget.RANDOM;

    let randomizeHelpText = t(
        'app.plugins.crisp.crispSubmitVoteDialog.randomize.helpTextOff',
    );

    if (randomizeWeight) {
        randomizeHelpText =
            countedShare != null
                ? t(
                      'app.plugins.crisp.crispSubmitVoteDialog.randomize.helpTextShare',
                      { share: countedShare },
                  )
                : t(
                      'app.plugins.crisp.crispSubmitVoteDialog.randomize.helpTextOn',
                  );
    }

    // Proving is slow and runs in the tab, warn before a navigation throws the work away.
    useEffect(() => {
        if (!isPending) {
            return;
        }

        const handleUnload = (event: BeforeUnloadEvent) =>
            event.preventDefault();

        window.addEventListener('beforeunload', handleUnload);

        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [isPending]);

    const buildStepState = (
        step: CrispSubmitVoteStep,
    ): TransactionStatusState => {
        const stepIndex = stepOrder.indexOf(step);
        const activeIndex = stepOrder.indexOf(activeStep);

        if (state === 'success' || stepIndex < activeIndex) {
            return 'success';
        }

        if (state === 'idle' || stepIndex > activeIndex) {
            return 'idle';
        }

        return state === 'error' ? 'error' : 'pending';
    };

    // A wallet submission, chosen or handed over by the relay, ends on the transaction being mined.
    const buildStepLabel = (step: CrispSubmitVoteStep) => {
        let suffix = step.toLowerCase();

        if (step === CrispSubmitVoteStep.BROADCAST && isWalletSubmission) {
            suffix = 'broadcastDirect';
        } else if (isMask && step !== CrispSubmitVoteStep.PROVE) {
            suffix = `${suffix}Mask`;
        }

        return t(`app.plugins.crisp.crispSubmitVoteDialog.step.${suffix}`);
    };

    // A mask is not signed, so it has no signing step.
    const visibleSteps = isMask
        ? stepOrder.filter((step) => step !== CrispSubmitVoteStep.SIGN)
        : stepOrder;

    const steps = visibleSteps.map((step, index) => ({
        id: step,
        order: index,
        meta: {
            label: buildStepLabel(step),
            state: buildStepState(step),
            addon:
                step === CrispSubmitVoteStep.BROADCAST &&
                transactionHash != null
                    ? {
                          label: t(
                              'app.plugins.crisp.crispSubmitVoteDialog.transactionLink',
                          ),
                          href: buildEntityUrl({
                              type: ChainEntityType.TRANSACTION,
                              id: transactionHash,
                          }),
                      }
                    : undefined,
        } satisfies ITransactionStatusStepMeta,
    }));

    const isDisabled =
        isPending || isLoading || isProposalLoading || !isRoundReady;

    let successMessage = isVoteUpdate
        ? 'app.plugins.crisp.crispSubmitVoteDialog.alert.voteUpdated'
        : 'app.plugins.crisp.crispSubmitVoteDialog.alert.voteSubmitted';

    if (isMask) {
        successMessage =
            'app.plugins.crisp.crispSubmitVoteDialog.alert.maskSubmitted';
    }

    const primaryAction =
        state === 'success'
            ? {
                  label: t(
                      'app.plugins.crisp.crispSubmitVoteDialog.action.done',
                  ),
                  onClick: () => close(),
              }
            : {
                  label: t(
                      state === 'error'
                          ? 'app.plugins.crisp.crispSubmitVoteDialog.action.retry'
                          : `app.plugins.crisp.crispSubmitVoteDialog.action.${isMask ? 'submitMask' : 'submit'}`,
                  ),
                  onClick: submitVote,
                  disabled: isDisabled,
                  isLoading: isPending,
              };

    return (
        <>
            <Dialog.Header
                title={t(
                    isMask
                        ? 'app.plugins.crisp.crispSubmitVoteDialog.mask.title'
                        : 'app.plugins.crisp.crispSubmitVoteDialog.title',
                )}
            />
            <Dialog.Content className="flex flex-col gap-4 pb-4 md:pb-6">
                <p className="font-normal text-base text-neutral-500 leading-normal">
                    {t(
                        isMask
                            ? `app.plugins.crisp.crispSubmitVoteDialog.mask.description.${maskTarget === CrispMaskTarget.SELF ? 'self' : 'random'}`
                            : 'app.plugins.crisp.crispSubmitVoteDialog.description',
                    )}
                </p>
                {canChooseMethod && (
                    <InputContainer
                        helpText={t(
                            `app.plugins.crisp.crispSubmitVoteDialog.method.${isDirect ? 'directHelpText' : 'relayHelpText'}`,
                        )}
                        id="crispSubmitVoteMethod"
                        label={t(
                            'app.plugins.crisp.crispSubmitVoteDialog.method.label',
                        )}
                        useCustomWrapper={true}
                    >
                        <ToggleGroup
                            isMultiSelect={false}
                            onChange={(value) =>
                                setMethod(
                                    (value as
                                        | CrispSubmitVoteMethod
                                        | undefined) ?? method,
                                )
                            }
                            value={method}
                        >
                            <Toggle
                                disabled={isPending}
                                label={t(
                                    'app.plugins.crisp.crispSubmitVoteDialog.method.relay',
                                )}
                                value={CrispSubmitVoteMethod.RELAY}
                            />
                            <Toggle
                                disabled={isPending}
                                label={t(
                                    'app.plugins.crisp.crispSubmitVoteDialog.method.direct',
                                )}
                                value={CrispSubmitVoteMethod.DIRECT}
                            />
                        </ToggleGroup>
                    </InputContainer>
                )}
                {!isMask && (
                    <Switch
                        checked={randomizeWeight}
                        disabled={isPending}
                        helpText={randomizeHelpText}
                        inlineLabel={t(
                            'app.plugins.crisp.crispSubmitVoteDialog.randomize.switch',
                        )}
                        label={t(
                            'app.plugins.crisp.crispSubmitVoteDialog.randomize.label',
                        )}
                        onCheckedChanged={setRandomizeWeight}
                    />
                )}
                <TransactionStatus.Container steps={steps}>
                    {steps.map((step) => (
                        <TransactionStatus.Step key={step.id} {...step} />
                    ))}
                </TransactionStatus.Container>
                {!(isRoundReady || isLoading) && (
                    <AlertInline
                        message={
                            roundError != null
                                ? `${t('app.plugins.crisp.crispSubmitVoteDialog.alert.roundNotReady')} (${describeError(roundError)})`
                                : t(
                                      'app.plugins.crisp.crispSubmitVoteDialog.alert.roundNotReady',
                                  )
                        }
                        variant="warning"
                    />
                )}
                {hasActiveSlot && !isMask && state !== 'success' && (
                    <AlertInline
                        message={t(
                            'app.plugins.crisp.crispSubmitVoteDialog.alert.slotActive',
                        )}
                        variant="info"
                    />
                )}
                {isWalletSubmission &&
                    !isDirect &&
                    isPending &&
                    activeStep === CrispSubmitVoteStep.BROADCAST && (
                        <AlertInline
                            message={t(
                                'app.plugins.crisp.crispSubmitVoteDialog.alert.walletFallback',
                            )}
                            variant="info"
                        />
                    )}
                {state === 'error' && (
                    <AlertInline
                        message={
                            error != null
                                ? describeError(error)
                                : t(
                                      'app.plugins.crisp.crispSubmitVoteDialog.alert.error',
                                  )
                        }
                        variant="critical"
                    />
                )}
                {state === 'success' && (
                    <AlertInline
                        message={t(successMessage)}
                        variant="success"
                    />
                )}
            </Dialog.Content>
            <Dialog.Footer primaryAction={primaryAction} />
        </>
    );
};
