'use client';

import {
    ChainEntityType,
    DefinitionList,
    formatterUtils,
    NumberFormat,
    Tag,
} from '@aragon/gov-ui-kit';
import { formatUnits } from 'viem';
import { GovernanceBodyDecisionItem } from '@/modules/createDao/components/createProcessForm';
import type {
    ISetupBodyFormExisting,
    ISetupBodyFormNew,
} from '@/modules/createDao/dialogs/setupBodyDialog';
import { BodyType } from '@/modules/createDao/types/enum';
import { useTokenVotingMembershipData } from '@/modules/governance/hooks/useTokenVotingMembershipData';
import type {
    ITokenSetupMembershipForm,
    ITokenSetupMembershipMember,
} from '@/plugins/tokenPlugin/components/tokenSetupMembership';
import { useDao } from '@/shared/api/daoService';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useDaoChain } from '@/shared/hooks/useDaoChain';
import { useDaoPluginInfo } from '@/shared/hooks/useDaoPluginInfo';
import { useTokenTotalSupply } from '@/shared/hooks/useTokenTotalSupply';
import { daoUtils } from '@/shared/utils/daoUtils';
import { dateUtils } from '@/shared/utils/dateUtils';
import type { ICrispSetupGovernanceForm } from '../crispSetupGovernance';

export interface ICrispProcessBodyFieldProps {
    /**
     * The field from the create process form.
     */
    body:
        | ISetupBodyFormNew<
              ICrispSetupGovernanceForm,
              ITokenSetupMembershipMember,
              ITokenSetupMembershipForm
          >
        | ISetupBodyFormExisting<
              ICrispSetupGovernanceForm,
              ITokenSetupMembershipMember,
              ITokenSetupMembershipForm
          >;
    /**
     * Displays / hides some of the governance settings depending on the process governance type.
     */
    isAdvancedGovernance?: boolean;
    /**
     * ID of the DAO.
     */
    daoId: string;
}

export const CrispProcessBodyField = (props: ICrispProcessBodyFieldProps) => {
    const { body, isAdvancedGovernance, daoId } = props;

    const daoUrlParams = { id: daoId };
    const { data: dao } = useDao({ urlParams: daoUrlParams });

    const { t } = useTranslations();
    const { buildEntityUrl, chainId } = useDaoChain({ network: dao?.network });

    const isExisting = body.type === BodyType.EXISTING;
    const { membership, governance } = body;

    const membershipParams = {
        queryParams: {
            daoId,
            pluginAddress: isExisting ? body.address : '',
        },
    };
    const { itemsCount: memberCount } = useTokenVotingMembershipData(
        membershipParams,
        { enabled: isExisting },
    );

    const {
        address: tokenAddress,
        name: tokenName,
        symbol: tokenSymbol,
        decimals: tokenDecimals,
    } = membership.token;

    const { data: totalSupply } = useTokenTotalSupply({
        chainId,
        address: tokenAddress,
    });

    const { minParticipation, minDuration } = governance;

    const formattedSupply =
        totalSupply != null && totalSupply > BigInt(0)
            ? `${formatterUtils.formatNumber(
                  formatUnits(totalSupply, tokenDecimals),
                  { format: NumberFormat.TOKEN_AMOUNT_LONG },
              )} ($${tokenSymbol})`
            : '-';

    const proposalDurationObject = dateUtils.secondsToDuration(minDuration);
    const formattedMinDuration = t(
        'app.plugins.crisp.crispProcessBodyField.proposalDurationDefinition',
        proposalDurationObject,
    );

    const numberOfMembers = isExisting
        ? memberCount
        : membership.members.length;

    const tokenProps = {
        link: {
            href: buildEntityUrl({
                type: ChainEntityType.TOKEN,
                id: tokenAddress,
            }),
            isOnchainEntity: true,
        },
        description: t(
            'app.plugins.crisp.crispProcessBodyField.tokenNameAndSymbol',
            { tokenName, tokenSymbol },
        ),
    };

    const contractInfo = useDaoPluginInfo({
        daoId,
        address: isExisting ? body.address : '',
    });

    return (
        <DefinitionList.Container className="w-full">
            <GovernanceBodyDecisionItem
                isAdvancedGovernance={isAdvancedGovernance}
                proposalType={body.proposalType}
            />
            {isExisting &&
                contractInfo.map(
                    ({ term, definition, description, link, copyValue }) => (
                        <DefinitionList.Item
                            copyValue={copyValue}
                            description={description}
                            key={term}
                            link={link}
                            term={term}
                        >
                            {definition}
                        </DefinitionList.Item>
                    ),
                )}
            <DefinitionList.Item
                term={t('app.plugins.crisp.crispProcessBodyField.tokenTerm')}
                {...(isExisting ? tokenProps : {})}
            >
                {tokenName} (${tokenSymbol})
            </DefinitionList.Item>
            {(numberOfMembers ?? 0) > 0 && (
                <DefinitionList.Item
                    link={
                        isExisting
                            ? {
                                  href: daoUtils.getDaoUrl(dao, 'members'),
                                  isExternal: false,
                              }
                            : undefined
                    }
                    term={t(
                        'app.plugins.crisp.crispProcessBodyField.distributionTerm',
                    )}
                >
                    {t('app.plugins.crisp.crispProcessBodyField.holders', {
                        count: numberOfMembers,
                    })}
                </DefinitionList.Item>
            )}
            <DefinitionList.Item
                term={t('app.plugins.crisp.crispProcessBodyField.supplyTerm')}
            >
                {formattedSupply}
            </DefinitionList.Item>
            <DefinitionList.Item
                term={t(
                    'app.plugins.crisp.crispProcessBodyField.ballotPrivacyTerm',
                )}
            >
                <Tag
                    className="max-w-fit"
                    label={t(
                        'app.plugins.crisp.crispProcessBodyField.encrypted',
                    )}
                    variant="primary"
                />
            </DefinitionList.Item>
            <DefinitionList.Item
                term={t(
                    'app.plugins.crisp.crispProcessBodyField.minParticipationTerm',
                )}
            >
                {t(
                    'app.plugins.crisp.crispProcessBodyField.minParticipationDefinition',
                    { minParticipation },
                )}
            </DefinitionList.Item>
            <DefinitionList.Item
                term={t(
                    'app.plugins.crisp.crispProcessBodyField.supportThresholdTerm',
                )}
            >
                {t(
                    'app.plugins.crisp.crispProcessBodyField.supportThresholdDefinition',
                    { supportThreshold: governance.supportThreshold },
                )}
            </DefinitionList.Item>
            {!isAdvancedGovernance && (
                <DefinitionList.Item
                    term={t(
                        'app.plugins.crisp.crispProcessBodyField.proposalDurationTerm',
                    )}
                >
                    {formattedMinDuration}
                </DefinitionList.Item>
            )}
        </DefinitionList.Container>
    );
};
