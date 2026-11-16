import { render, screen } from '@testing-library/react';
import { useWatch } from 'react-hook-form';
import { ProposalCreationMode } from '@/modules/createDao/components/createProcessForm';
import type { ISetupBodyForm } from '@/modules/createDao/dialogs/setupBodyDialog';
import {
    generateSetupBodyFormExisting,
    generateSetupBodyFormNew,
} from '@/modules/createDao/testUtils';
import type { ITokenProposalCreationSettingsProps } from '@/plugins/tokenPlugin/components/tokenProposalCreationSettings';
import { FormWrapper } from '@/shared/testUtils';
import { CrispProposalCreationSettings } from './crispProposalCreationSettings';

jest.mock(
    '@/plugins/tokenPlugin/components/tokenProposalCreationSettings',
    () => ({
        TokenProposalCreationSettings: () => (
            <div data-testid="token-creation-settings" />
        ),
    }),
);

describe('<CrispProposalCreationSettings /> component', () => {
    const stagedPrefix = 'stages.0.bodies.0';

    const CanCreateProposalProbe = () => {
        const canCreateProposal = useWatch({
            name: `${stagedPrefix}.canCreateProposal`,
        });

        return (
            <span data-testid="can-create">{String(canCreateProposal)}</span>
        );
    };

    const createTestComponent = (props?: {
        body?: ISetupBodyForm;
        formPrefix?: string;
    }) => {
        const completeProps = {
            body: generateSetupBodyFormNew(),
            formPrefix: stagedPrefix,
            mode: ProposalCreationMode.LISTED_BODIES,
            ...props,
        } as ITokenProposalCreationSettingsProps;

        return (
            <FormWrapper
                defaultValues={{
                    stages: [{ bodies: [{ canCreateProposal: true }] }],
                    body: { canCreateProposal: true },
                }}
            >
                <CrispProposalCreationSettings {...completeProps} />
                <CanCreateProposalProbe />
            </FormWrapper>
        );
    };

    it('lets a new body of a staged process restrict proposal creation like a token voting body', () => {
        render(createTestComponent({ body: generateSetupBodyFormNew() }));

        expect(
            screen.getByTestId('token-creation-settings'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/crispProposalCreationSettings.notSupported/),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId('can-create')).toHaveTextContent('true');
    });

    it('shows an existing body of a staged process as not selectable, whatever condition it carries', () => {
        const body = generateSetupBodyFormExisting({
            proposalCreationConditionAddress:
                '0x0000000000000000000000000000000000000abc',
        });
        render(createTestComponent({ body }));

        expect(
            screen.queryByTestId('token-creation-settings'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(/crispProposalCreationSettings.notSupported/),
        ).toBeInTheDocument();
        expect(screen.getByTestId('can-create')).toHaveTextContent('false');
    });

    it('renders the token settings for a body of a simple process', () => {
        const body = generateSetupBodyFormExisting();
        render(createTestComponent({ body, formPrefix: 'body' }));

        expect(
            screen.getByTestId('token-creation-settings'),
        ).toBeInTheDocument();
    });
});
