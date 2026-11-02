import type { IProposalActionComponentProps } from '@aragon/gov-ui-kit';
import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { IProposalAction } from '@/modules/governance/api/governanceService';
import type { IProposalActionData } from '@/modules/governance/components/createProposalForm';
import type { IDaoPlugin } from '@/shared/api/daoService';
import { useFormField } from '@/shared/hooks/useFormField';
import type { ICrispPluginSettings } from '../../../types';
import { crispActionUtils } from '../../../utils/crispActionUtils';
import { CrispSetupGovernance } from '../../crispSetupGovernance';

export interface ICrispUpdateSettingsActionProps
    extends IProposalActionComponentProps<
        IProposalActionData<IProposalAction, IDaoPlugin<ICrispPluginSettings>>
    > {}

export const CrispUpdateSettingsAction: React.FC<
    ICrispUpdateSettingsActionProps
> = (props) => {
    const { index, action } = props;
    const { token } = action.meta.settings;

    const { setValue } = useFormContext();

    const actionFieldName = `actions.[${index.toString()}]`;
    useFormField<Record<string, IProposalActionData>, typeof actionFieldName>(
        actionFieldName,
    );

    const formPrefix = `${actionFieldName}.proposedSettings`;

    // The value is undefined while the action is being removed from the form
    const settings = useWatch<Record<string, ICrispPluginSettings | undefined>>(
        { name: formPrefix },
    );

    useEffect(() => {
        if (settings == null) {
            return;
        }

        const { data, parameterValues } =
            crispActionUtils.buildUpdateSettingsData({
                settings,
                decimals: token.decimals,
            });

        setValue(`${actionFieldName}.data`, data);
        setValue(
            `${actionFieldName}.inputData.parameters[0].value`,
            parameterValues,
        );
    }, [actionFieldName, settings, setValue, token.decimals]);

    return (
        <CrispSetupGovernance
            formPrefix={formPrefix}
            isSubPlugin={action.meta.isSubPlugin}
            membershipSettings={{ token }}
            showProposalCreationSettings={!action.meta.isSubPlugin}
        />
    );
};
