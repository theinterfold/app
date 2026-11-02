import {
    ChainEntityType,
    DateFormat,
    formatterUtils,
} from '@aragon/gov-ui-kit';
import { formatUnits } from 'viem';
import { useWalletAccount } from '@/modules/application/hooks/useWalletAccount';
import type {
    IPermissionCheckGuardParams,
    IPermissionCheckGuardResult,
} from '@/modules/governance/types';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useDaoChain } from '@/shared/hooks/useDaoChain';
import { bigIntUtils } from '@/shared/utils/bigIntUtils';
import type { ICrispPlugin, ICrispProposal } from '../../types';
import { useCrispProposal } from '../useCrispProposal';
import { useCrispVotingPower } from '../useCrispVotingPower';

export interface ICrispPermissionCheckVoteSubmissionParams
    extends IPermissionCheckGuardParams<ICrispPlugin> {}

/**
 * The CRISP program decides who can vote: it reads the voting power at the snapshot of the round
 * and rejects slots below the floor of the round. The check reads the same values instead of the
 * current balance, to not let a voter sign and prove a ballot that is rejected.
 */
export const useCrispPermissionCheckVoteSubmission = (
    params: ICrispPermissionCheckVoteSubmissionParams,
): IPermissionCheckGuardResult => {
    const { plugin, proposal: proposalParam } = params;

    const { address } = useWalletAccount();
    const { t } = useTranslations();

    const { token } = plugin.settings;
    const { symbol: tokenSymbol, decimals: tokenDecimals } = token;

    const { proposal, isLoading: isProposalLoading } = useCrispProposal({
        proposal: proposalParam as ICrispProposal | undefined,
    });

    const { blockTimestamp, network, transactionHash } = proposalParam!;

    const { buildEntityUrl } = useDaoChain({ network });

    const { votingPower, isLoading: isVotingPowerLoading } =
        useCrispVotingPower({ proposal, address });

    // The floor of the round is the minimum frozen into the proposal, raised to one ballot unit
    const proposalMinVotingPower = bigIntUtils.safeParse(
        proposal?.settings.minVoterVotingPower ??
            plugin.settings.minVoterVotingPower,
    );
    const roundDivisor = votingPower?.votingPowerDivisor ?? BigInt(0);
    const minVotingPower =
        roundDivisor > proposalMinVotingPower
            ? roundDivisor
            : proposalMinVotingPower;
    const snapshotVotingPower = votingPower?.rawVotingPower ?? BigInt(0);

    const hasPermission =
        votingPower != null &&
        votingPower.ballotVotingPower > BigInt(0) &&
        snapshotVotingPower >= minVotingPower;

    const creationDate = blockTimestamp * 1000;
    const formattedCreationDate = formatterUtils.formatDate(creationDate, {
        format: DateFormat.YEAR_MONTH_DAY,
    });
    const proposalCreationUrl = buildEntityUrl({
        type: ChainEntityType.TRANSACTION,
        id: transactionHash,
    });

    const formattedMinVotingPower = formatUnits(minVotingPower, tokenDecimals);
    const formattedSnapshotVotingPower = formatUnits(
        snapshotVotingPower,
        tokenDecimals,
    );

    const settings = [
        {
            term: t(
                'app.plugins.crisp.crispPermissionCheckVoteSubmission.createdAt',
            ),
            definition: formattedCreationDate!,
            link: {
                href: proposalCreationUrl,
                textClassName: 'first-letter:capitalize',
            },
        },
        {
            term: t(
                'app.plugins.crisp.crispPermissionCheckVoteSubmission.membership',
            ),
            definition: `≥${formattedMinVotingPower} ${tokenSymbol}`,
        },
        {
            term: t(
                'app.plugins.crisp.crispPermissionCheckVoteSubmission.snapshotVotingPower',
            ),
            definition: `${formattedSnapshotVotingPower} ${tokenSymbol}`,
        },
    ];

    return {
        hasPermission,
        settings: [settings],
        isLoading: isProposalLoading || isVotingPowerLoading,
        isRestricted: true,
    };
};
