import { GukModulesProvider } from '@aragon/gov-ui-kit';
import { render, screen, waitFor } from '@testing-library/react';
import { FormProvider, type UseFormReturn, useForm } from 'react-hook-form';
import { generateToken } from '@/modules/finance/testUtils';
import type { IUseDaoChainReturn } from '@/shared/hooks/useDaoChain';
import * as useDaoChain from '@/shared/hooks/useDaoChain';
import * as useHelpCenterLink from '@/shared/hooks/useHelpCenterLink';
import { ReactQueryWrapper } from '@/shared/testUtils';
import * as useGovernanceToken from '../../hooks/useGovernanceToken';
import {
    type ITokenSetupMembershipImportTokenProps,
    TokenSetupMembershipImportToken,
} from './tokenSetupMembershipImportToken';

// The component imports the kit through the `-original` tsconfig alias, which Jest does not map.
jest.mock(
    '@aragon/gov-ui-kit-original',
    () => jest.requireActual('@aragon/gov-ui-kit'),
    { virtual: true },
);

describe('<TokenSetupMembershipImportToken /> component', () => {
    const useGovernanceTokenSpy = jest.spyOn(
        useGovernanceToken,
        'useGovernanceToken',
    );
    const useDaoChainSpy = jest.spyOn(useDaoChain, 'useDaoChain');
    const useHelpCenterLinkSpy = jest.spyOn(
        useHelpCenterLink,
        'useHelpCenterLink',
    );

    const alertNamespace =
        'app.plugins.token.tokenSetupMembership.importToken.alert';
    const stepNamespace =
        'app.plugins.token.tokenSetupMembership.importToken.step';
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

    let formMethods: UseFormReturn | undefined;

    const mockGovernanceToken = (isGovernanceCompatible: boolean) =>
        useGovernanceTokenSpy.mockReturnValue({
            isError: false,
            isLoading: false,
            data: {
                token: generateToken({
                    name: 'Token',
                    symbol: 'TKN',
                    totalSupply: '100',
                    decimals: 18,
                }),
                isGovernanceCompatible,
                isDelegationCompatible: isGovernanceCompatible,
            },
        });

    const TestForm = (
        props: Partial<ITokenSetupMembershipImportTokenProps>,
    ) => {
        const methods = useForm({
            defaultValues: { member: { token: { address } } },
        });
        formMethods = methods as unknown as UseFormReturn;

        return (
            <GukModulesProvider>
                <ReactQueryWrapper>
                    <FormProvider {...methods}>
                        <TokenSetupMembershipImportToken
                            daoId="dao-id"
                            formPrefix="member"
                            {...props}
                        />
                    </FormProvider>
                </ReactQueryWrapper>
            </GukModulesProvider>
        );
    };

    beforeEach(() => {
        useDaoChainSpy.mockReturnValue({
            chainId: 1,
        } as IUseDaoChainReturn);
        useHelpCenterLinkSpy.mockReturnValue('https://guide.example.org');
    });

    afterEach(() => {
        formMethods = undefined;
        useGovernanceTokenSpy.mockReset();
        useDaoChainSpy.mockReset();
        useHelpCenterLinkSpy.mockReset();
    });

    it('prepares a wrapped governance token when the imported token does not support governance', async () => {
        mockGovernanceToken(false);

        render(<TestForm />);

        await waitFor(() =>
            expect(formMethods?.getValues('member.token.name')).toEqual(
                'Governance Token',
            ),
        );
        expect(formMethods?.getValues('member.token.symbol')).toEqual('gTKN');
        expect(formMethods?.getValues('member.token.totalSupply')).toEqual('0');
        expect(
            screen.getByText(
                `${alertNamespace}.notGovernanceCompatible.message`,
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(`${stepNamespace}.delegation`),
        ).toBeInTheDocument();
    });

    describe('with wrapping disabled', () => {
        it('rejects a token that does not support governance and keeps the form invalid', async () => {
            mockGovernanceToken(false);

            render(<TestForm disableWrapping={true} />);

            expect(
                screen.getByText(
                    `${alertNamespace}.notGovernanceSupported.message`,
                ),
            ).toBeInTheDocument();
            expect(
                screen.queryByText(
                    `${alertNamespace}.notGovernanceCompatible.message`,
                ),
            ).not.toBeInTheDocument();
            await waitFor(() =>
                expect(formMethods?.getValues('member.token.name')).toEqual(''),
            );
            expect(
                formMethods?.getValues('member.token.totalSupply'),
            ).toBeUndefined();
        });

        it('keeps a token that supports governance as is', async () => {
            mockGovernanceToken(true);

            render(<TestForm disableWrapping={true} />);

            await waitFor(() =>
                expect(formMethods?.getValues('member.token.name')).toEqual(
                    'Token',
                ),
            );
            expect(formMethods?.getValues('member.token.totalSupply')).toEqual(
                '100',
            );
        });

        it('does not check the delegation of the token', () => {
            mockGovernanceToken(true);

            render(<TestForm disableWrapping={true} />);

            expect(
                screen.getByText(`${stepNamespace}.governance`),
            ).toBeInTheDocument();
            expect(
                screen.queryByText(`${stepNamespace}.delegation`),
            ).not.toBeInTheDocument();
        });
    });
});
