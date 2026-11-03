import { useMemo } from 'react';
import { BaseError, ExecutionRevertedError, type Hex } from 'viem';
import { useCall } from 'wagmi';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import type { IDaoPlugin, Network } from '@/shared/api/daoService';
import { networkDefinitions } from '@/shared/constants/networkDefinitions';
import { pluginRegistryUtils } from '@/shared/utils/pluginRegistryUtils';
import { GovernanceSlotId } from '../../constants/moduleSlots';
import { publishProposalDialogUtils } from '../../dialogs/publishProposalDialog/publishProposalDialogUtils';

export interface IUseSimulateProposalCreationParams {
    /**
     * Plugin used to create a proposal.
     */
    plugin: IDaoPlugin;
    /**
     * Network of the DAO.
     */
    network?: Network;
}

export interface IUseSimulateProposalCreationResult {
    /**
     * Whether the simulation request is in progress.
     */
    isLoading: boolean;
    /**
     * Whether the simulation request has failed.
     */
    isError: boolean;
    /**
     * Simulation result.
     */
    result?: 'success' | 'failure';
}

const dummyProposal = {
    actions: [],
    title: 'Test title',
    summary: 'Test description',
    body: '',
    addActions: true,
    resources: [],
    startTimeMode: 'now',
};

const dummyCid = 'QmVZjGBGNmkgTsch6E8Eu1EzYJRqZZKQZoc2xRaySanWvs';

/**
 * Simulates a proposal creation transaction to check if the user has permission to create a proposal.
 */
export const useSimulateProposalCreation = (
    params: IUseSimulateProposalCreationParams,
): IUseSimulateProposalCreationResult => {
    const { plugin, network } = params;
    const { address: userAddress } = useWalletAccount();

    const chainId =
        network != null ? networkDefinitions[network].id : undefined;

    // A process this build cannot build a proposal for is not eligible: skip the
    // simulation and report a definite failure, not the fail-open request error.
    const canBuildProposal =
        pluginRegistryUtils.getSlotFunction({
            pluginId: plugin.interfaceType,
            slotId: GovernanceSlotId.GOVERNANCE_BUILD_CREATE_PROPOSAL_DATA,
        }) != null;

    const isEnabled =
        canBuildProposal && userAddress != null && chainId != null;

    // Memoized so the calldata (which embeds a now-relative end date) is built
    // once and does not change the useCall query key on every render, which
    // would re-trigger the RPC simulation on each render.
    const transactionData = useMemo(
        () =>
            isEnabled
                ? publishProposalDialogUtils.buildTransaction({
                      proposal: dummyProposal,
                      metadataCid: dummyCid,
                      plugin,
                  })
                : undefined,
        [isEnabled, plugin],
    );

    const { isLoading, isError, error, isSuccess } = useCall({
        account: userAddress,
        chainId,
        ...transactionData,
        query: {
            enabled: isEnabled,
            refetchOnWindowFocus: false,
        },
    });

    // Only ExecutionRevertedError is treated as a simulation failure. All other
    // errors represent failed simulation request, e.g., RPC not available.
    const revertError =
        isError && error instanceof BaseError
            ? error.walk((e) => e instanceof ExecutionRevertedError)
            : undefined;
    const isRequestError = isError && revertError == null;

    // The simulation does not run the prerequisite steps (e.g. a fee deposit) of the process and its bodies, so a
    // revert they resolve does not make the user ineligible.
    const isPrerequisiteRevert =
        revertError != null &&
        pluginRegistryUtils
            .getSlotFunctions<Hex, boolean>(
                GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_PREREQUISITE_REVERT,
            )
            .some((isResolved) => isResolved(getRevertData(error)));

    const isSimulationError =
        isError && revertError != null && !isPrerequisiteRevert;
    const isFailure = !canBuildProposal || isSimulationError;
    const isSuccessful = isSuccess || isPrerequisiteRevert;

    return {
        isLoading,
        isError: isRequestError,
        result: isSuccessful ? 'success' : isFailure ? 'failure' : undefined,
    };
};

// Raw revert data sits on the innermost error of the call, as an object on some RPC errors
const getRevertData = (error: unknown): Hex => {
    const { data } =
        error instanceof BaseError
            ? (error.walk() as { data?: Hex | { data?: Hex } })
            : {};

    return (typeof data === 'object' ? data.data : data) ?? '0x';
};
