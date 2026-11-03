import { ProposalVotingTab, Tabs } from '@aragon/gov-ui-kit';
import { render, screen } from '@testing-library/react';
import * as useCrispProposalModule from '../../hooks/useCrispProposal';
import { generateCrispProposal } from '../../testUtils';
import {
    CrispProposalVotingBreakdown,
    type ICrispProposalVotingBreakdownProps,
} from './crispProposalVotingBreakdown';

describe('<CrispProposalVotingBreakdown /> component', () => {
    const useCrispProposalSpy = jest.spyOn(
        useCrispProposalModule,
        'useCrispProposal',
    );

    beforeEach(() => {
        useCrispProposalSpy.mockImplementation(({ proposal }) => ({
            proposal,
            isLoading: false,
        }));
    });

    afterEach(() => {
        useCrispProposalSpy.mockReset();
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
});
