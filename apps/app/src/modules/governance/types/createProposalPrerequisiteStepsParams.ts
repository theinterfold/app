import type { IDaoPlugin } from '@/shared/api/daoService';
import type { ITransactionDialogStep } from '@/shared/components/transactionDialog';
import type { IProposalCreate } from '../dialogs/publishProposalDialog';

export interface ICreateProposalPrerequisiteStepsParams<
    TProposal extends IProposalCreate = IProposalCreate,
> {
    /**
     * ID of the DAO to create the proposal for.
     */
    daoId: string;
    /**
     * Plugin to create the proposal on, or a body of the process the proposal is created on.
     */
    plugin: IDaoPlugin;
    /**
     * Form values collected on the create-proposal wizard.
     */
    proposal: TProposal;
    /**
     * Advances the publish dialog, must be called when the step completes.
     */
    onSuccess: () => void;
}

export interface ICreateProposalPrerequisiteStepsResult {
    /**
     * Steps to run before the proposal transaction, empty when nothing is required. The array must
     * be referentially stable between renders (e.g. memoized).
     */
    steps: ITransactionDialogStep[];
    /**
     * Defines if the steps are final. The publish dialog does not start until the steps of every
     * plugin are resolved.
     */
    isResolved: boolean;
}
