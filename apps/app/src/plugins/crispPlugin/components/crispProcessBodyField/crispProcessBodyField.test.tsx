import { GukModulesProvider } from '@aragon/gov-ui-kit';
import { render, screen } from '@testing-library/react';
import { BodyType } from '@/modules/createDao/types/enum';
import * as useTokenVotingMembershipDataModule from '@/modules/governance/hooks/useTokenVotingMembershipData';
import * as daoService from '@/shared/api/daoService';
import { Network } from '@/shared/api/daoService';
import * as useDaoChainModule from '@/shared/hooks/useDaoChain';
import * as useDaoPluginInfoModule from '@/shared/hooks/useDaoPluginInfo';
import {
    generateDao,
    generateReactQueryResultSuccess,
} from '@/shared/testUtils';
import { generateCrispPluginSettings } from '../../testUtils';
import {
    CrispProcessBodyField,
    type ICrispProcessBodyFieldProps,
} from './crispProcessBodyField';

describe('<CrispProcessBodyField /> component', () => {
    const useDaoSpy = jest.spyOn(daoService, 'useDao');
    const useDaoChainSpy = jest.spyOn(useDaoChainModule, 'useDaoChain');
    const useDaoPluginInfoSpy = jest.spyOn(
        useDaoPluginInfoModule,
        'useDaoPluginInfo',
    );
    const useTokenVotingMembershipDataSpy = jest.spyOn(
        useTokenVotingMembershipDataModule,
        'useTokenVotingMembershipData',
    );

    beforeEach(() => {
        useDaoSpy.mockReturnValue(
            generateReactQueryResultSuccess({ data: generateDao() }),
        );
        useDaoChainSpy.mockReturnValue({
            chainId: 1,
            network: Network.ETHEREUM_MAINNET,
            buildEntityUrl: () => 'https://etherscan.io/token',
        } as unknown as ReturnType<typeof useDaoChainModule.useDaoChain>);
        useDaoPluginInfoSpy.mockReturnValue([]);
        useTokenVotingMembershipDataSpy.mockReturnValue({
            itemsCount: 0,
        } as ReturnType<
            typeof useTokenVotingMembershipDataModule.useTokenVotingMembershipData
        >);
    });

    afterEach(() => {
        useDaoSpy.mockReset();
        useDaoChainSpy.mockReset();
        useDaoPluginInfoSpy.mockReset();
        useTokenVotingMembershipDataSpy.mockReset();
    });

    const generateBody = (
        totalSupply: string | null = '1000000000000000000000',
    ): ICrispProcessBodyFieldProps['body'] => ({
        internalId: 'body-id',
        plugin: 'crisp',
        type: BodyType.NEW,
        canCreateProposal: true,
        name: 'CRISP',
        resources: [],
        governance: generateCrispPluginSettings(),
        membership: {
            members: [],
            token: {
                address: '0xToken',
                name: 'Token',
                symbol: 'TKN',
                decimals: 18,
                totalSupply,
            },
        },
    });

    const createTestComponent = (
        props?: Partial<ICrispProcessBodyFieldProps>,
    ) => {
        const completeProps: ICrispProcessBodyFieldProps = {
            daoId: 'dao-id',
            body: generateBody(),
            ...props,
        };

        return (
            <GukModulesProvider>
                <CrispProcessBodyField {...completeProps} />
            </GukModulesProvider>
        );
    };

    it('renders the token supply of a new body from the form data', () => {
        render(createTestComponent());

        expect(screen.getByText(/supplyTerm/)).toBeInTheDocument();
        expect(screen.getByText(/1,000.*\(\$TKN\)/)).toBeInTheDocument();
    });

    it('renders the token supply of an installed body from the plugin settings token', () => {
        const body = {
            ...generateBody(),
            type: BodyType.EXISTING as const,
            address: '0xBody',
            proposalCreationConditionAddress: '0xCondition',
        };
        render(createTestComponent({ body }));

        expect(screen.getByText(/1,000.*\(\$TKN\)/)).toBeInTheDocument();
    });

    it.each([
        { label: 'zero', totalSupply: '0' },
        { label: 'missing', totalSupply: null },
    ])(
        'renders a placeholder when the token supply is $label',
        ({ totalSupply }) => {
            render(createTestComponent({ body: generateBody(totalSupply) }));

            expect(
                screen.queryByText(/^\d.*\(\$TKN\)$/),
            ).not.toBeInTheDocument();
            expect(screen.getByText('-')).toBeInTheDocument();
        },
    );
});
