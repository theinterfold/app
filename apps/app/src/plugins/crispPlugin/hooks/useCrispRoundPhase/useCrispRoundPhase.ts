import { DateFormat, formatterUtils } from '@aragon/gov-ui-kit';
import { useTranslations } from '@/shared/components/translationsProvider';
import type { ICrispProposal } from '../../types';
import {
    type CrispRoundPhase,
    crispProposalUtils,
} from '../../utils/crispProposalUtils';

export interface IUseCrispRoundPhaseResult {
    /**
     * Step the round of the proposal is in.
     */
    phase: CrispRoundPhase;
    /**
     * Title of the step.
     */
    heading: string;
    /**
     * What happens in the step and, once the window closed, until when it may run before the
     * round fails.
     */
    description: string;
}

/**
 * Describes the step of the round of a proposal whose tally is not known and that has not failed.
 */
export const useCrispRoundPhase = (
    proposal: ICrispProposal,
): IUseCrispRoundPhaseResult => {
    const { t } = useTranslations();

    const phase = crispProposalUtils.getRoundPhase(proposal);
    const deadline = crispProposalUtils.getRoundPhaseDeadline(proposal);
    const isDeadlinePassed = deadline != null && deadline <= Date.now();

    const description = t(
        `app.plugins.crisp.useCrispRoundPhase.phase.${phase}.description`,
    );
    const deadlineText =
        deadline == null
            ? undefined
            : t(
                  `app.plugins.crisp.useCrispRoundPhase.deadline.${isDeadlinePassed ? 'passed' : 'upcoming'}`,
                  {
                      date: formatterUtils.formatDate(deadline, {
                          format: DateFormat.YEAR_MONTH_DAY_TIME,
                      }),
                  },
              );

    return {
        phase,
        heading: t(
            `app.plugins.crisp.useCrispRoundPhase.phase.${phase}.heading`,
        ),
        description:
            deadlineText == null
                ? description
                : `${description} ${deadlineText}`,
    };
};
