'use client';

import {
    AlertInline,
    Button,
    Card,
    DateFormat,
    formatterUtils,
    ProposalStatus,
} from '@aragon/gov-ui-kit';
import { useEffect, useState } from 'react';
import { ProposalExecutionStatus } from '@/modules/governance/components/proposalExecutionStatus';
import { GovernanceSlotId } from '@/modules/governance/constants/moduleSlots';
import { usePermissionCheckGuard } from '@/modules/governance/hooks/usePermissionCheckGuard';
import type { ISubmitVoteProps } from '@/modules/governance/types';
import { TokenVotingOptions } from '@/plugins/tokenPlugin/components/tokenSubmitVote/components/tokenVotingOptions';
import type { VoteOption } from '@/plugins/tokenPlugin/types';
import { useDialogContext } from '@/shared/components/dialogProvider';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useDaoPlugins } from '@/shared/hooks/useDaoPlugins';
import { CrispPluginDialogId } from '../../constants/crispPluginDialogId';
import type { ICrispSubmitVoteDialogParams } from '../../dialogs/crispSubmitVoteDialog';
import { useCrispProposal } from '../../hooks/useCrispProposal';
import { useCrispRound } from '../../hooks/useCrispRound';
import type { ICrispPlugin, ICrispProposal } from '../../types';
import { crispProposalUtils } from '../../utils/crispProposalUtils';

export interface ICrispSubmitVoteProps
    extends ISubmitVoteProps<ICrispProposal> {}

export const CrispSubmitVote: React.FC<ICrispSubmitVoteProps> = (props) => {
    const { daoId, proposal, isVeto } = props;
    const { pluginAddress } = proposal;

    const { t } = useTranslations();
    const { open } = useDialogContext();

    // The tally lives on the plugin, the indexed sub-proposal an SPP stage hands over lacks it
    const { proposal: resolvedProposal } = useCrispProposal({ proposal });
    const status = crispProposalUtils.getProposalStatus(resolvedProposal);

    // The window can open before the committee has generated the round's key, and a ballot cannot
    // be encrypted until it is published.
    const { isRoundReady, isLoading: isRoundLoading } = useCrispRound({
        network: resolvedProposal.network,
        e3Id: resolvedProposal.e3Id,
        enabled: status === ProposalStatus.ACTIVE,
    });
    const isAwaitingKey = !(isRoundReady || isRoundLoading);

    // The round can start some time after the proposal is created, which the stage window does not show
    const isAwaitingStart =
        status === ProposalStatus.PENDING &&
        resolvedProposal.startDate * 1000 > Date.now();
    const isUnavailable = isAwaitingStart || isAwaitingKey;

    const plugins = useDaoPlugins({
        daoId,
        pluginAddress,
        includeLinkedAccounts: true,
        includeSubPlugins: true,
    })!;
    const plugin = plugins[0].meta as ICrispPlugin;

    const [showOptions, setShowOptions] = useState(false);
    const [selectedOption, setSelectedOption] = useState<string | undefined>(
        undefined,
    );

    const { check: submitVoteGuard, result: canSubmitVote } =
        usePermissionCheckGuard({
            permissionNamespace: 'vote',
            slotId: GovernanceSlotId.GOVERNANCE_PERMISSION_CHECK_VOTE_SUBMISSION,
            plugin,
            daoId,
            proposal,
            onSuccess: () => setShowOptions(true),
        });

    const handleVoteClick = () =>
        canSubmitVote ? setShowOptions(true) : submitVoteGuard();

    const handleSubmitVoteClick = () => {
        const params: ICrispSubmitVoteDialogParams = {
            proposal,
            voteOption: Number(selectedOption) as VoteOption,
        };
        open(CrispPluginDialogId.SUBMIT_VOTE, { params });
    };

    useEffect(() => {
        if (!canSubmitVote || isUnavailable) {
            setShowOptions(false);
        }
    }, [canSubmitVote, isUnavailable]);

    // An SPP stage keeps this action mounted after its own window, as the CRISP result lands
    // later. The stage only learns the result once the round's proposal is executed, and no vote
    // can trigger that: the decrypted tally decides, so the execution is offered here.
    if (status === ProposalStatus.EXECUTABLE) {
        return (
            <ProposalExecutionStatus
                daoId={daoId}
                proposal={resolvedProposal}
            />
        );
    }

    // Ballots are only accepted within the round's window
    if (!(status === ProposalStatus.ACTIVE || isAwaitingStart)) {
        return null;
    }

    return (
        <div className="flex flex-col gap-4">
            {showOptions ? (
                <>
                    <Card className="border border-neutral-100 p-6 shadow-neutral-sm">
                        <TokenVotingOptions
                            isVeto={isVeto}
                            onChange={setSelectedOption}
                            value={selectedOption}
                        />
                    </Card>
                    <div className="flex w-full flex-col items-center gap-y-3 md:flex-row md:gap-x-4">
                        <Button
                            className="w-full md:w-fit"
                            disabled={!selectedOption}
                            onClick={handleSubmitVoteClick}
                            size="md"
                            variant="primary"
                        >
                            {t(
                                'app.plugins.crisp.crispSubmitVote.buttons.submit',
                            )}
                        </Button>
                        <Button
                            className="w-full md:w-fit"
                            onClick={() => setShowOptions(false)}
                            size="md"
                            variant="tertiary"
                        >
                            {t(
                                'app.plugins.crisp.crispSubmitVote.buttons.cancel',
                            )}
                        </Button>
                    </div>
                </>
            ) : (
                <Button
                    className="w-fit"
                    disabled={isUnavailable}
                    onClick={handleVoteClick}
                    size="md"
                >
                    {t('app.plugins.crisp.crispSubmitVote.buttons.vote')}
                </Button>
            )}
            {isUnavailable && (
                <AlertInline
                    message={
                        isAwaitingStart
                            ? t(
                                  'app.plugins.crisp.crispSubmitVote.roundNotStarted',
                                  {
                                      date: formatterUtils.formatDate(
                                          resolvedProposal.startDate * 1000,
                                          {
                                              format: DateFormat.YEAR_MONTH_DAY_TIME,
                                          },
                                      ),
                                  },
                              )
                            : t(
                                  'app.plugins.crisp.crispSubmitVote.roundNotReady',
                              )
                    }
                    variant="info"
                />
            )}
        </div>
    );
};
