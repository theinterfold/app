import type { IDaoPlugin } from '@/shared/api/daoService';
import type { IProposalCreate } from '../dialogs/publishProposalDialog';

export interface IBuildCreateProposalParamsParams {
    /**
     * Body of the process to build the custom proposal parameters for.
     */
    body: IDaoPlugin;
    /**
     * Form values collected on the create-proposal wizard.
     */
    proposal: IProposalCreate;
}
