import { ProposalStatus } from '@aragon/gov-ui-kit';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import * as wagmi from 'wagmi';
import * as ensModule from '@/modules/ens';
import { SettingsSlotId } from '@/modules/settings/constants/moduleSlots';
import { PluginInterfaceType } from '@/shared/api/daoService';
import * as useDaoPluginInfo from '@/shared/hooks/useDaoPluginInfo';
import * as useSlotSingleFunction from '@/shared/hooks/useSlotSingleFunction';
import { generatePluginSettings } from '@/shared/testUtils';
import { GovernanceSlotId } from '../../constants/moduleSlots';
import { generateProposal } from '../../testUtils';
import {
    type IProposalVotingTerminalProps,
    ProposalVotingTerminal,
} from './proposalVotingTerminal';

jest.mock('@/shared/components/pluginSingleComponent', () => ({
    PluginSingleComponent: (props: { slotId: string; pluginId: string }) => (
        <div
            data-pluginid={props.pluginId}
            data-slotid={props.slotId}
            data-testid="plugin-component-mock"
        />
    ),
}));

jest.mock('../voteList', () => ({
    VoteList: () => <div data-testid="vote-list-mock" />,
}));

describe('<ProposalVotingTerminal /> component', () => {
    const useSlotSingleFunctionSpy = jest.spyOn(
        useSlotSingleFunction,
        'useSlotSingleFunction',
    );
    const useConnectionSpy = jest.spyOn(wagmi, 'useConnection');
    const useEnsNameSpy = jest.spyOn(ensModule, 'useEnsName');
    const useDaoPluginInfoSpy = jest.spyOn(
        useDaoPluginInfo,
        'useDaoPluginInfo',
    );

    beforeEach(() => {
        useConnectionSpy.mockReturnValue({} as wagmi.UseConnectionReturnType);
        useDaoPluginInfoSpy.mockReturnValue([]);
        useEnsNameSpy.mockReturnValue({
            data: undefined,
            isLoading: false,
        } as ReturnType<typeof ensModule.useEnsName>);
    });

    afterEach(() => {
        useConnectionSpy.mockReset();
        useSlotSingleFunctionSpy.mockReset();
        useDaoPluginInfoSpy.mockReset();
        useEnsNameSpy.mockReset();
    });

    const createTestComponent = (
        props?: Partial<IProposalVotingTerminalProps>,
    ) => {
        const completeProps: IProposalVotingTerminalProps = {
            proposal: generateProposal(),
            daoId: 'test-id',
            status: ProposalStatus.PENDING,
            ...props,
        };

        return <ProposalVotingTerminal {...completeProps} />;
    };

    it('renders the plugin-specific proposal breakdown component', () => {
        const proposal = generateProposal({
            pluginInterfaceType: PluginInterfaceType.MULTISIG,
        });
        render(createTestComponent({ proposal }));
        const breakdown = screen
            .getAllByTestId('plugin-component-mock')
            .find(
                (component) =>
                    component.dataset.slotid ===
                    GovernanceSlotId.GOVERNANCE_PROPOSAL_VOTING_BREAKDOWN,
            );
        expect(breakdown).toBeInTheDocument();
        expect(breakdown?.dataset.pluginid).toEqual(
            proposal.pluginInterfaceType,
        );
    });

    it('renders the list of votes when proposal status is not pending or unreached', async () => {
        render(createTestComponent({ status: ProposalStatus.ACTIVE }));
        await userEvent.click(screen.getByRole('tab', { name: 'Votes' }));
        expect(screen.getByTestId('vote-list-mock')).toBeInTheDocument();
    });

    it('opens the votes of a pending proposal whose vote has started, such as a closed vote whose tally is still computed', async () => {
        const startDate = Math.floor(Date.now() / 1000) - 60;
        const proposal = generateProposal({ startDate });
        render(createTestComponent({ proposal }));
        await userEvent.click(screen.getByRole('tab', { name: 'Votes' }));
        expect(screen.getByTestId('vote-list-mock')).toBeInTheDocument();
    });

    it('keeps the votes of a pending proposal closed until its vote starts', () => {
        const startDate = Math.floor(Date.now() / 1000) + 30 * 60;
        const proposal = generateProposal({ startDate });
        render(createTestComponent({ proposal }));
        expect(screen.getByRole('tab', { name: 'Votes' })).toBeDisabled();
    });

    it('tells when voting opens while a pending proposal has not started', () => {
        const startDate = Math.floor(Date.now() / 1000) + 30 * 60;
        const proposal = generateProposal({ startDate });
        render(createTestComponent({ proposal }));
        expect(
            screen.getByText(/proposalVotingTerminal.votingStarts/),
        ).toBeInTheDocument();
    });

    it('does not tell when voting opens once the start date has passed', () => {
        const startDate = Math.floor(Date.now() / 1000) - 60;
        const proposal = generateProposal({ startDate });
        render(createTestComponent({ proposal }));
        expect(
            screen.queryByText(/proposalVotingTerminal.votingStarts/),
        ).not.toBeInTheDocument();
    });

    it('renders the plugin info and proposal settings', async () => {
        const daoId = 'test-id';
        const settings = generatePluginSettings();
        const parsedSettings = {
            term: 'plugin-term',
            definition: 'plugin-value',
        };
        const proposal = generateProposal({
            settings,
            pluginInterfaceType: PluginInterfaceType.UNKNOWN,
        });

        useSlotSingleFunctionSpy.mockReturnValue([parsedSettings]);
        useDaoPluginInfoSpy.mockImplementation((params) => params.settings!);

        render(createTestComponent({ daoId, proposal }));
        await userEvent.click(screen.getByRole('tab', { name: 'Settings' }));
        expect(useDaoPluginInfoSpy).toHaveBeenCalled();
        const expectedParams = {
            daoId,
            settings: proposal.settings,
            pluginAddress: proposal.pluginAddress,
        };
        expect(useSlotSingleFunctionSpy).toHaveBeenCalledWith({
            params: expectedParams,
            pluginId: proposal.pluginInterfaceType,
            slotId: SettingsSlotId.SETTINGS_GOVERNANCE_SETTINGS_HOOK,
        });
        expect(screen.getByText(parsedSettings.term)).toBeInTheDocument();
        expect(screen.getByText(parsedSettings.definition)).toBeInTheDocument();
    });
});
