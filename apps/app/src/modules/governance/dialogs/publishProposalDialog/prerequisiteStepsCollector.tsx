import { useEffect } from 'react';
import type {
    ICreateProposalPrerequisiteStepsParams,
    ICreateProposalPrerequisiteStepsResult,
} from '../../types';

export interface IPrerequisiteStepsCollectorProps
    extends ICreateProposalPrerequisiteStepsParams {
    /**
     * Hook registered by the plugin for the prerequisite-steps slot.
     */
    usePrerequisiteSteps: (
        params: ICreateProposalPrerequisiteStepsParams,
    ) => ICreateProposalPrerequisiteStepsResult;
    /**
     * Callback called with the steps of the plugin whenever they change.
     */
    onChange: (
        pluginAddress: string,
        result: ICreateProposalPrerequisiteStepsResult,
    ) => void;
}

// Renders one prerequisite-steps hook per plugin, as the number of plugins (process bodies) is
// not known upfront and hooks cannot be called in a loop.
export const PrerequisiteStepsCollector: React.FC<
    IPrerequisiteStepsCollectorProps
> = (props) => {
    const { usePrerequisiteSteps, onChange, ...params } = props;

    const { steps, isResolved } = usePrerequisiteSteps(params);
    const { address } = params.plugin;

    useEffect(
        () => onChange(address, { steps, isResolved }),
        [address, steps, isResolved, onChange],
    );

    return null;
};
