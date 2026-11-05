import { ProposalVotingTab, Tabs } from '@aragon/gov-ui-kit';
import { render, screen } from '@testing-library/react';
import { governanceService } from '@/modules/governance/api/governanceService/governanceService';
import * as daoService from '@/shared/api/daoService';
import { PluginInterfaceType } from '@/shared/api/daoService';
import * as dialogProvider from '@/shared/components/dialogProvider';
import * as useDaoChainModule from '@/shared/hooks/useDaoChain';
import {
    generateDao,
    generateDaoPlugin,
    generateDialogContext,
    generateReactQueryResultSuccess,
    ReactQueryWrapper,
} from '@/shared/testUtils';
import * as useCrispFeeCreditsModule from '../../hooks/useCrispFeeCredits';
import * as useCrispProposalModule from '../../hooks/useCrispProposal';
import * as useCrispRefundModule from '../../hooks/useCrispRefund';
import { generateCrispProposal } from '../../testUtils';
import { CrispE3FailureReason } from '../../types';
import { crispRefundUtils } from '../../utils/crispRefundUtils';
import {
    CrispProposalVotingBreakdown,
    type ICrispProposalVotingBreakdownProps,
} from './crispProposalVotingBreakdown';

describe('<CrispProposalVotingBreakdown /> component', () => {
    const useCrispProposalSpy = jest.spyOn(
        useCrispProposalModule,
        'useCrispProposal',
    );

    const useDaoSpy = jest.spyOn(daoService, 'useDao');
    const getProposalBySlugSpy = jest.spyOn(
        governanceService,
        'getProposalBySlug',
    );
    const useDialogContextSpy = jest.spyOn(dialogProvider, 'useDialogContext');
    const useDaoChainSpy = jest.spyOn(useDaoChainModule, 'useDaoChain');
    const fetchFailureConditionSpy = jest.spyOn(
        crispRefundUtils,
        'fetchFailureCondition',
    );
    const useCrispRefundSpy = jest.spyOn(
        useCrispRefundModule,
        'useCrispRefund',
    );
    const useCrispFeeCreditsSpy = jest.spyOn(
        useCrispFeeCreditsModule,
        'useCrispFeeCredits',
    );

    beforeEach(() => {
        useCrispProposalSpy.mockImplementation(({ proposal }) => ({
            proposal,
            isLoading: false,
        }));
    });

    afterEach(() => {
        useCrispProposalSpy.mockReset();
        getProposalBySlugSpy.mockReset();
        useDialogContextSpy.mockReset();
        useDaoSpy.mockReset();
        useDaoChainSpy.mockReset();
        fetchFailureConditionSpy.mockReset();
        useCrispRefundSpy.mockReset();
        useCrispFeeCreditsSpy.mockReset();
    });

    const createTestComponent = (
        props?: Partial<ICrispProposalVotingBreakdownProps>,
    ) => {
        const completeProps: ICrispProposalVotingBreakdownProps = {
            proposal: generateCrispProposal(),
            ...props,
        };

        return (
            <Tabs.Root defaultValue={ProposalVotingTab.BREAKDOWN}>
                <CrispProposalVotingBreakdown {...completeProps} />
            </Tabs.Root>
        );
    };

    it('keeps the vote submission below the encrypted notice while the tally is unpublished', () => {
        const proposal = generateCrispProposal({ isTallyPublished: false });
        render(createTestComponent({ proposal, children: 'vote-children' }));
        expect(screen.getByRole('tabpanel')).toBeInTheDocument();
        expect(
            screen.getByText(/crispProposalVotingBreakdown.encrypted.heading/),
        ).toBeInTheDocument();
        expect(screen.getByText('vote-children')).toBeInTheDocument();
    });

    it('offers the refund of a round that missed a deadline nobody marked yet', async () => {
        const pluginAddress = '0x0000000000000000000000000000000000000012';
        const dao = generateDao({
            plugins: [
                generateDaoPlugin({
                    address: pluginAddress,
                    slug: 'crisp',
                    interfaceType: PluginInterfaceType.CRISP,
                }),
            ],
        });
        useCrispProposalSpy.mockImplementation(
            jest.requireActual('../../hooks/useCrispProposal/useCrispProposal')
                .useCrispProposal,
        );
        useDialogContextSpy.mockReturnValue(generateDialogContext());
        useDaoSpy.mockReturnValue(
            generateReactQueryResultSuccess({ data: dao }),
        );
        useDaoChainSpy.mockReturnValue({
            chainId: 11_155_111,
        } as ReturnType<typeof useDaoChainModule.useDaoChain>);
        fetchFailureConditionSpy.mockResolvedValue(
            CrispE3FailureReason.COMPUTE_TIMEOUT,
        );
        useCrispRefundSpy.mockReturnValue({
            state: undefined,
            step: undefined,
            isPayer: false,
            refetch: jest.fn(),
        } as unknown as ReturnType<typeof useCrispRefundModule.useCrispRefund>);
        useCrispFeeCreditsSpy.mockReturnValue(
            {} as ReturnType<
                typeof useCrispFeeCreditsModule.useCrispFeeCredits
            >,
        );
        const proposal = generateCrispProposal({
            pluginAddress,
            isTallyPublished: false,
            e3Id: '7',
        });

        getProposalBySlugSpy.mockResolvedValue(proposal);

        render(
            <ReactQueryWrapper>
                {createTestComponent({ proposal })}
            </ReactQueryWrapper>,
        );

        expect(
            await screen.findByText(/crispProposalRefund.heading/),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(
                /crispProposalVotingBreakdown.encrypted.heading/,
            ),
        ).not.toBeInTheDocument();
    });
});
