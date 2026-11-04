'use client';

import { CheckboxCard } from '@aragon/gov-ui-kit';
import { useEffect } from 'react';
import type { ISetupBodyForm } from '@/modules/createDao/dialogs/setupBodyDialog';
import type { IPluginProposalCreationSettingsParams } from '@/modules/createDao/types';
import { BodyType } from '@/modules/createDao/types/enum';
import { TokenProposalCreationSettings } from '@/plugins/tokenPlugin/components/tokenProposalCreationSettings';
import type { ITokenSetupGovernanceForm } from '@/plugins/tokenPlugin/components/tokenSetupGovernance';
import type {
    ITokenSetupMembershipForm,
    ITokenSetupMembershipMember,
} from '@/plugins/tokenPlugin/components/tokenSetupMembership';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useFormField } from '@/shared/hooks/useFormField';

export interface ICrispProposalCreationSettingsProps
    extends IPluginProposalCreationSettingsParams<
        ITokenSetupGovernanceForm,
        ITokenSetupMembershipMember,
        ITokenSetupMembershipForm
    > {}

/**
 * In a staged process the proposal creation rule is built from the condition contracts installed
 * by the bodies, and CRISP installs none, so the body is shown as not selectable. In a simple
 * process the plugin itself enforces the voting power of the proposer, as the token plugin does.
 */
export const CrispProposalCreationSettings: React.FC<
    ICrispProposalCreationSettingsProps
> = (props) => {
    const { body, formPrefix } = props;

    const { t } = useTranslations();

    // Bodies of a staged process are located under `stages.<n>.bodies.<m>`
    const isStaged = formPrefix.startsWith('stages.');

    const { onChange: onCreateProposalChange } = useFormField<
        ISetupBodyForm,
        'canCreateProposal'
    >('canCreateProposal', { fieldPrefix: formPrefix, defaultValue: true });

    useEffect(() => {
        if (isStaged) {
            onCreateProposalChange(false);
        }
    }, [isStaged, onCreateProposalChange]);

    if (!isStaged) {
        return <TokenProposalCreationSettings {...props} />;
    }

    const name = body.type === BodyType.EXTERNAL ? '' : (body.name ?? '');
    const description =
        body.type === BodyType.EXTERNAL ? undefined : body.description;

    // The card renders its children only when checked, so the reason sits below it
    return (
        <div className="flex w-full flex-col gap-2">
            <CheckboxCard
                checked={false}
                className="w-full"
                description={description}
                disabled={true}
                label={name}
            />
            <p className="text-neutral-500 text-sm">
                {t(
                    'app.plugins.crisp.crispProposalCreationSettings.notSupported',
                )}
            </p>
        </div>
    );
};
