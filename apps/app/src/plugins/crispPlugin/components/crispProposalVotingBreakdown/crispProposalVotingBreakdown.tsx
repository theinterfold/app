'use client';

import {
    EmptyState,
    ProposalVoting,
    ProposalVotingTab,
    Tabs,
} from '@aragon/gov-ui-kit';
import type { ReactNode } from 'react';
import { formatUnits } from 'viem';
import { VoteOption } from '@/plugins/tokenPlugin/types';
import { bigIntUtils } from '@/shared/utils/bigIntUtils';
import { useCrispProposal } from '../../hooks/useCrispProposal';
import { useCrispRoundPhase } from '../../hooks/useCrispRoundPhase';
import type { ICrispProposal } from '../../types';
import { crispProposalUtils } from '../../utils/crispProposalUtils';
import { CrispProposalRefund } from '../crispProposalRefund';

export interface ICrispProposalVotingBreakdownProps {
    /**
     * Proposal to be used to display the breakdown.
     */
    proposal: ICrispProposal;
    /**
     * Defines if the voting is to veto or not.
     */
    isVeto?: boolean;
    /**
     * Additional children to render.
     */
    children?: ReactNode;
}

export const CrispProposalVotingBreakdown: React.FC<
    ICrispProposalVotingBreakdownProps
> = (props) => {
    const { proposal: proposalEnvelope, children, isVeto } = props;

    // The backend indexes the round while it goes, the proposal is polled until it is settled.
    const { proposal } = useCrispProposal({ proposal: proposalEnvelope });
    const { heading, description } = useCrispRoundPhase(proposal);

    const { symbol, decimals } = proposal.settings.token;
    const { minParticipation, supportThreshold, historicalTotalSupply } =
        proposal.settings;

    if (proposal.failureReason != null && !proposal.executed.status) {
        return <CrispProposalRefund proposal={proposal} />;
    }

    // Encrypted until the committee publishes the tally and the divisor that turns its counts
    // into token units is known. The children hold the vote submission, which is open exactly
    // while the tally is encrypted.
    if (!crispProposalUtils.isTallyResolved(proposal)) {
        return (
            <Tabs.Content
                className="flex flex-col gap-4"
                value={ProposalVotingTab.BREAKDOWN}
            >
                <EmptyState
                    description={description}
                    heading={heading}
                    objectIllustration={{ object: 'TIMELOCK' }}
                />
                {children}
            </Tabs.Content>
        );
    }

    const yesVotes = crispProposalUtils.getOptionVotingPower(
        proposal,
        VoteOption.YES,
    );
    const noVotes = crispProposalUtils.getOptionVotingPower(
        proposal,
        VoteOption.NO,
    );
    const abstainVotes = crispProposalUtils.getOptionVotingPower(
        proposal,
        VoteOption.ABSTAIN,
    );

    const totalSupply = bigIntUtils.safeParse(historicalTotalSupply);

    // The kit cannot measure participation without the supply snapshot the proposal status
    // is computed from; keep the tab and the vote submission it holds rather than failing
    // the page.
    if (totalSupply <= BigInt(0)) {
        return (
            <Tabs.Content
                className="flex flex-col gap-4"
                value={ProposalVotingTab.BREAKDOWN}
            >
                {children}
            </Tabs.Content>
        );
    }

    const tokenTotalSupply = formatUnits(totalSupply, decimals);

    return (
        <ProposalVoting.BreakdownToken
            isVeto={isVeto}
            minParticipation={minParticipation}
            supportThreshold={supportThreshold}
            tokenSymbol={symbol}
            tokenTotalSupply={tokenTotalSupply}
            totalAbstain={abstainVotes}
            totalNo={noVotes}
            totalYes={yesVotes}
        >
            {children}
        </ProposalVoting.BreakdownToken>
    );
};
