'use client';

import { Button, Card } from '@aragon/gov-ui-kit';
import { useEffect, useState } from 'react';
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
import type { ICrispPlugin, ICrispProposal } from '../../types';

export interface ICrispSubmitVoteProps
    extends ISubmitVoteProps<ICrispProposal> {}

export const CrispSubmitVote: React.FC<ICrispSubmitVoteProps> = (props) => {
    const { daoId, proposal, isVeto } = props;
    const { pluginAddress } = proposal;

    const { t } = useTranslations();
    const { open } = useDialogContext();

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
        if (!canSubmitVote) {
            setShowOptions(false);
        }
    }, [canSubmitVote]);

    return (
        <div className="flex flex-col gap-4">
            {!showOptions && (
                <Button className="w-fit" onClick={handleVoteClick} size="md">
                    {t('app.plugins.crisp.crispSubmitVote.buttons.vote')}
                </Button>
            )}
            {showOptions && (
                <Card className="border border-neutral-100 p-6 shadow-neutral-sm">
                    <TokenVotingOptions
                        isVeto={isVeto}
                        onChange={setSelectedOption}
                        value={selectedOption}
                    />
                </Card>
            )}
            {showOptions && (
                <div className="flex w-full flex-col items-center gap-y-3 md:flex-row md:gap-x-4">
                    <Button
                        className="w-full md:w-fit"
                        disabled={!selectedOption}
                        onClick={handleSubmitVoteClick}
                        size="md"
                        variant="primary"
                    >
                        {t('app.plugins.crisp.crispSubmitVote.buttons.submit')}
                    </Button>
                    <Button
                        className="w-full md:w-fit"
                        onClick={() => setShowOptions(false)}
                        size="md"
                        variant="tertiary"
                    >
                        {t('app.plugins.crisp.crispSubmitVote.buttons.cancel')}
                    </Button>
                </div>
            )}
        </div>
    );
};
