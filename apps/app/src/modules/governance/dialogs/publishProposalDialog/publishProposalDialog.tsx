import {
    addressUtils,
    invariant,
    ProposalDataListItem,
    ProposalStatus,
} from '@aragon/gov-ui-kit';
import { useCallback, useMemo, useState } from 'react';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import { useIndexedProposalStatus } from '@/modules/governance/hooks/useIndexedProposalStatus';
import { PluginInterfaceType, useDao } from '@/shared/api/daoService';
import { usePinJson } from '@/shared/api/ipfsService/mutations';
import { TransactionType } from '@/shared/api/transactionService';
import {
    type IBuildTransactionDialogSuccessLinkHref,
    type ITransactionDialogActionParams,
    type ITransactionDialogStep,
    type ITransactionDialogStepMeta,
    TransactionDialog,
} from '@/shared/components/transactionDialog';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useDaoPlugins } from '@/shared/hooks/useDaoPlugins';
import { useStepper } from '@/shared/hooks/useStepper';
import { daoUtils } from '@/shared/utils/daoUtils';
import { pluginRegistryUtils } from '@/shared/utils/pluginRegistryUtils';
import { GovernanceSlotId } from '../../constants/moduleSlots';
import type {
    ICreateProposalPrerequisiteStepsParams,
    ICreateProposalPrerequisiteStepsResult,
} from '../../types';
import { PrerequisiteStepsCollector } from './prerequisiteStepsCollector';
import type { IPublishProposalDialogProps } from './publishProposalDialog.api';
import { publishProposalDialogUtils } from './publishProposalDialogUtils';

export enum PublishProposalStep {
    PIN_METADATA = 'PIN_METADATA',
}

export const PublishProposalDialog: React.FC<IPublishProposalDialogProps> = (
    props,
) => {
    const { location } = props;

    invariant(
        location.params != null,
        'PublishProposalDialog: required parameters must be set.',
    );

    const { address } = useWalletAccount();
    invariant(
        address != null,
        'PublishProposalDialog: user must be connected.',
    );

    const {
        daoId,
        plugin,
        proposal,
        prepareActions,
        translationNamespace,
        transactionInfo,
    } = location.params;

    const { title, summary } = proposal;

    const { t } = useTranslations();

    const { data: dao } = useDao({ urlParams: { id: daoId } });
    const [indexedProposalSlug, setIndexedProposalSlug] = useState<string>();
    const proposalDaoId = daoUtils.resolvePluginDaoId(daoId, plugin, dao);
    const rendersProposalStatusCard =
        plugin.interfaceType !== PluginInterfaceType.ADMIN;
    const proposalCardStatus = useIndexedProposalStatus({
        daoId: proposalDaoId,
        fallbackStatus: ProposalStatus.DRAFT,
        isIndexed: rendersProposalStatusCard && indexedProposalSlug != null,
        slug: indexedProposalSlug,
    });

    const stepper = useStepper<ITransactionDialogStepMeta, string>({
        initialActiveStep: PublishProposalStep.PIN_METADATA,
    });

    const {
        data: pinJsonData,
        status,
        mutate: pinJson,
    } = usePinJson({ onSuccess: stepper.nextStep });

    const subPlugins = useDaoPlugins({
        daoId,
        includeSubPlugins: true,
        includeLinkedAccounts: true,
    });

    // Publishing to a staged process creates a proposal on each of its bodies, so the
    // prerequisites of the bodies apply as well.
    const prerequisitePlugins = useMemo(() => {
        const bodies = (subPlugins ?? [])
            .map((item) => item.meta)
            .filter((body) =>
                addressUtils.isAddressEqual(body.parentPlugin, plugin.address),
            );

        return [plugin, ...bodies].flatMap((item) => {
            const usePrerequisiteSteps = pluginRegistryUtils.getSlotFunction<
                ICreateProposalPrerequisiteStepsParams,
                ICreateProposalPrerequisiteStepsResult
            >({
                slotId: GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_PREREQUISITE_STEPS,
                pluginId: item.interfaceType,
            });

            return usePrerequisiteSteps
                ? [{ plugin: item, usePrerequisiteSteps }]
                : [];
        });
    }, [subPlugins, plugin]);

    const [prerequisites, setPrerequisites] = useState<
        Record<string, ICreateProposalPrerequisiteStepsResult>
    >({});

    const handlePrerequisitesChange = useCallback(
        (
            pluginAddress: string,
            result: ICreateProposalPrerequisiteStepsResult,
        ) =>
            setPrerequisites((current) => ({
                ...current,
                [pluginAddress]: result,
            })),
        [],
    );

    const prerequisiteSteps = useMemo(
        () =>
            prerequisitePlugins.flatMap(
                ({ plugin: item }) => prerequisites[item.address]?.steps ?? [],
            ),
        [prerequisitePlugins, prerequisites],
    );

    // A plugin that has not reported yet looks like one without prerequisites, so the dialog
    // only starts once every plugin has resolved its steps.
    const arePrerequisitesResolved = prerequisitePlugins.every(
        ({ plugin: item }) => prerequisites[item.address]?.isResolved === true,
    );

    const handlePinJson = useCallback(
        (params: ITransactionDialogActionParams) => {
            if (!arePrerequisitesResolved) {
                return;
            }

            const proposalMetadata =
                publishProposalDialogUtils.prepareMetadata(proposal);
            pinJson({ body: proposalMetadata }, params);
        },
        [pinJson, proposal, arePrerequisitesResolved],
    );

    const handleIndexed = useCallback((result: { slug?: string }) => {
        setIndexedProposalSlug(result.slug);
    }, []);

    const handlePrepareTransaction = async () => {
        invariant(
            pinJsonData != null,
            'PublishProposalDialog: metadata not pinned for prepare transaction step.',
        );
        const { IpfsHash: metadataCid } = pinJsonData;

        const { actions } = proposal;

        const processedActions =
            await publishProposalDialogUtils.prepareActions({
                actions,
                prepareActions,
            });
        const processedProposal = { ...proposal, actions: processedActions };

        return publishProposalDialogUtils.buildTransaction({
            proposal: processedProposal,
            metadataCid,
            plugin,
        });
    };

    // Handler function to disable the navigation block when the transaction is needed.
    // We can't simply just pass the href to the TransactionDialog.
    // For linked account plugins the link points directly to the linked account's page so the
    // slug resolves in the correct DAO context.
    const getProposalsLink = ({
        slug,
    }: IBuildTransactionDialogSuccessLinkHref) => {
        // The slug can be absent if the success link is built before the proposal
        // slug resolves — fall back to the proposals list instead of crashing.
        const proposalPath = slug
            ? `proposals/${slug.toUpperCase()}`
            : 'proposals';

        if (daoUtils.isLinkedAccountPlugin(plugin, dao)) {
            return `/dao/${dao!.network}/${plugin.daoAddress}/${proposalPath}`;
        }

        return daoUtils.getDaoUrl(dao, proposalPath)!;
    };

    const customSteps: ITransactionDialogStep[] = useMemo(
        () => [
            {
                id: PublishProposalStep.PIN_METADATA,
                order: 0,
                meta: {
                    label: t(
                        `app.governance.publishProposalDialog.step.${PublishProposalStep.PIN_METADATA}.label`,
                    ),
                    errorLabel: t(
                        `app.governance.publishProposalDialog.step.${PublishProposalStep.PIN_METADATA}.errorLabel`,
                    ),
                    state: status,
                    action: handlePinJson,
                    auto: arePrerequisitesResolved,
                },
            },
            ...prerequisiteSteps.map((step, index) => ({
                ...step,
                order: index + 1,
            })),
        ],
        [status, handlePinJson, prerequisiteSteps, t, arePrerequisitesResolved],
    );

    const namespace =
        translationNamespace ?? 'app.governance.publishProposalDialog';

    // Explicit id: the calldata embeds a now-relative end date, so hash a whitelist of stable content
    // fields instead, so no volatile field can make the id drift between re-opens. The guard at submit
    // recomputes the same id/scope via these shared helpers to detect a duplicate in-flight creation.
    const intentId = useMemo(
        () =>
            publishProposalDialogUtils.buildProposalIntentId({
                daoId,
                plugin,
                proposal,
            }),
        [daoId, plugin, proposal],
    );
    const intentScope = useMemo(
        () =>
            publishProposalDialogUtils.buildProposalScope(
                daoId,
                plugin.address,
            ),
        [daoId, plugin.address],
    );

    return (
        <TransactionDialog
            analytics={{
                flow: 'create_proposal',
                transactionTypeEvent: 'governance_proposal_create',
            }}
            customSteps={customSteps}
            description={t(`${namespace}.description`)}
            indexingFallbackUrl={daoUtils.getDaoUrl(dao, 'proposals')}
            intent={{ id: intentId, scope: intentScope }}
            network={dao?.network}
            onIndexed={rendersProposalStatusCard ? handleIndexed : undefined}
            prepareTransaction={handlePrepareTransaction}
            stepper={stepper}
            submitLabel={t(`${namespace}.button.submit`)}
            successLink={{
                label: t('app.governance.publishProposalDialog.button.success'),
                href: getProposalsLink,
            }}
            title={t(`${namespace}.title`)}
            transactionInfo={transactionInfo}
            transactionType={TransactionType.PROPOSAL_CREATE}
        >
            {prerequisitePlugins.map(
                ({ plugin: item, usePrerequisiteSteps }) => (
                    <PrerequisiteStepsCollector
                        daoId={daoId}
                        key={item.address}
                        onChange={handlePrerequisitesChange}
                        onSuccess={stepper.nextStep}
                        plugin={item}
                        proposal={proposal}
                        usePrerequisiteSteps={usePrerequisiteSteps}
                    />
                ),
            )}
            {rendersProposalStatusCard && (
                <ProposalDataListItem.Structure
                    id={indexedProposalSlug?.toUpperCase()}
                    publisher={{ address }}
                    status={proposalCardStatus}
                    summary={summary}
                    title={title}
                />
            )}
        </TransactionDialog>
    );
};
