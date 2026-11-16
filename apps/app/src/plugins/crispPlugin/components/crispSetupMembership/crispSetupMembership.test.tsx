import { render, screen } from '@testing-library/react';
import { zeroAddress } from 'viem';
import type { ITokenSetupMembershipProps } from '@/plugins/tokenPlugin/components/tokenSetupMembership';
import { FormWrapper } from '@/shared/testUtils';
import { CrispSetupMembership } from './crispSetupMembership';

// Keeps the address it mounts with, as the import form does in its own state
jest.mock(
    '@/plugins/tokenPlugin/components/tokenSetupMembership/components/tokenSetupMembershipImportToken',
    () => ({
        TokenSetupMembershipImportToken: ({
            formPrefix,
        }: {
            formPrefix: string;
        }) => {
            const { useState } = jest.requireActual('react');
            const { useFormContext } = jest.requireActual('react-hook-form');
            const { getValues } = useFormContext();
            const [mountedAddress] = useState(() =>
                getValues(`${formPrefix}.token.address`),
            );

            return <span data-testid="mounted-address">{mountedAddress}</span>;
        },
    }),
);

describe('<CrispSetupMembership /> component', () => {
    const formPrefix = 'body.membership';

    const createTestComponent = (tokenAddress: string) => (
        <FormWrapper
            defaultValues={{
                body: {
                    membership: {
                        token: { address: tokenAddress },
                        members: [{ address: '0x1' }],
                    },
                },
            }}
        >
            <CrispSetupMembership
                {...({
                    formPrefix,
                    daoId: 'dao',
                } as ITokenSetupMembershipProps)}
            />
        </FormWrapper>
    );

    it('does not show the placeholder token address of the token plugin form', () => {
        render(createTestComponent(zeroAddress));

        expect(screen.getByTestId('mounted-address')).toBeEmptyDOMElement();
    });

    it('keeps the token the user already imported when coming back from the next step', () => {
        const importedAddress = '0x0000000000000000000000000000000000000abc';
        render(createTestComponent(importedAddress));

        expect(screen.getByTestId('mounted-address')).toHaveTextContent(
            importedAddress,
        );
    });
});
