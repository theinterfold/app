'use client';

import { CheckboxCard } from '@aragon/gov-ui-kit';
import { useEffect } from 'react';
import type { ISetupBodyForm } from '@/modules/createDao/dialogs/setupBodyDialog';
import { BodyType } from '@/modules/createDao/types/enum';
import {
    type ITokenProposalCreationSettingsProps,
    TokenProposalCreationSettings,
} from '@/plugins/tokenPlugin/components/tokenProposalCreationSettings';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useFormField } from '@/shared/hooks/useFormField';

/**
 * The plugin enforces the voting power of the proposer itself, so a simple process, like the token
 * plugin, only needs the minimum voting power to be set. In a staged process the creation rule is
 * built from the proposal-creation condition returned by the setup of the bodies (`helpers[0]`, from
 * build 2 of CRISP), which applies the same rule: a new body can be selected like a token voting body.
 * An existing body is shown as not selectable: the condition of an installed CRISP body is not
 * referenced by any permission, so the app cannot know it.
 */
export const CrispProposalCreationSettings: React.FC<
    ITokenProposalCreationSettingsProps
> = (props) => {
    const { body, formPrefix } = props;

    const { t } = useTranslations();

    // Bodies of a staged process are located under `stages.<n>.bodies.<m>`
    const isStaged = formPrefix.startsWith('stages.');

    const existingStagedBody =
        isStaged && body.type === BodyType.EXISTING ? body : undefined;
    const isExistingStagedBody = existingStagedBody != null;

    const { onChange: onCreateProposalChange } = useFormField<
        ISetupBodyForm,
        'canCreateProposal'
    >('canCreateProposal', { fieldPrefix: formPrefix, defaultValue: true });

    useEffect(() => {
        if (isExistingStagedBody) {
            onCreateProposalChange(false);
        }
    }, [isExistingStagedBody, onCreateProposalChange]);

    if (existingStagedBody == null) {
        return <TokenProposalCreationSettings {...props} />;
    }

    const { name = '', description } = existingStagedBody;

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
            <p className="text-sm text-neutral-500">
                {t(
                    'app.plugins.crisp.crispProposalCreationSettings.notSupported',
                )}
            </p>
        </div>
    );
};
