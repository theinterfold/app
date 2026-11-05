'use client';

import { useTranslations } from '@/shared/components/translationsProvider';
import { useCrispProposal } from '../../hooks/useCrispProposal';
import type { ICrispProposal } from '../../types';
import { crispProposalUtils } from '../../utils/crispProposalUtils';

export interface ICrispProposalVotingSummaryProps {
    /**
     * Proposal to be used to display the summary.
     */
    proposal?: ICrispProposal;
    /**
     * Name of the plugin.
     */
    name: string;
    /**
     * Defines if the voting is to veto or not.
     */
    isVeto: boolean;
    /**
     * Additional executed status when plugin is a sub-plugin.
     */
    isExecuted?: boolean;
}

export const CrispProposalVotingSummary: React.FC<
    ICrispProposalVotingSummaryProps
> = (props) => {
    const { proposal: proposalEnvelope, name, isVeto, isExecuted } = props;

    const { t } = useTranslations();

    // The backend indexes the round while it goes, the proposal is polled until it is settled.
    const { proposal } = useCrispProposal({ proposal: proposalEnvelope });

    const renderStatus = (statusKey: string, statusClass: string) => (
        <p className="font-normal text-base text-neutral-800 leading-tight md:text-lg">
            {name}{' '}
            <span className={statusClass}>
                {t(`app.plugins.crisp.crispProposalVotingSummary.${statusKey}`)}
            </span>
        </p>
    );

    if (!proposal) {
        return (
            <p className="font-normal text-base text-neutral-800 leading-tight md:text-lg">
                {name}
            </p>
        );
    }

    // Ballots are encrypted while the proposal is active, and until the committee has published
    // the tally after it closed: no support values can be shown, and "not approved" would be a
    // guess. The summary tells the step of the round instead.
    if (!crispProposalUtils.isTallyResolved(proposal) && !isExecuted) {
        return renderStatus(
            proposal.failureReason != null
                ? 'failed'
                : `phase.${crispProposalUtils.getRoundPhase(proposal)}`,
            'text-neutral-500',
        );
    }

    const isApprovalReached =
        isExecuted === true || crispProposalUtils.hasSucceeded(proposal);

    const approvalText = isApprovalReached ? 'approved' : 'notApproved';
    const vetoText = isApprovalReached ? 'vetoed' : 'notVetoed';
    const statusText = isVeto ? vetoText : approvalText;

    const statusClass =
        isApprovalReached && isVeto
            ? 'text-critical-800'
            : isApprovalReached
              ? 'text-success-800'
              : 'text-neutral-500';

    return renderStatus(statusText, statusClass);
};
