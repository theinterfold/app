'use client';

import { InputContainer } from '@aragon/gov-ui-kit';
import type { ITokenSetupGovernanceProps } from '@/plugins/tokenPlugin/components/tokenSetupGovernance';
import { MinParticipationField } from '@/plugins/tokenPlugin/components/tokenSetupGovernance/fields/minParticipationField';
import { ProposalCreationEligibilityField } from '@/plugins/tokenPlugin/components/tokenSetupGovernance/fields/proposalCreationEligibilityField';
import { SupportThresholdField } from '@/plugins/tokenPlugin/components/tokenSetupGovernance/fields/supportThresholdField';
import { AdvancedDateInputDuration } from '@/shared/components/forms/advancedDateInput/advancedDateInputDuration';
import { useTranslations } from '@/shared/components/translationsProvider';
import { CrispMinVoterVotingPowerField } from '../crispMinVoterVotingPowerField';

// Lower minimum than the other plugins, to allow short rounds
const voteDurationMin = { days: 0, hours: 0, minutes: 15 };
const voteDurationDefault = { days: 1, hours: 0, minutes: 0 };

export const CrispSetupGovernance: React.FC<ITokenSetupGovernanceProps> = (
    props,
) => {
    const {
        formPrefix,
        membershipSettings,
        isSubPlugin,
        showProposalCreationSettings,
    } = props;

    const { t } = useTranslations();

    return (
        <div className="flex w-full flex-col gap-y-6">
            <SupportThresholdField formPrefix={formPrefix} />
            <MinParticipationField
                formPrefix={formPrefix}
                token={membershipSettings.token}
            />
            <CrispMinVoterVotingPowerField
                formPrefix={formPrefix}
                token={membershipSettings.token}
            />
            {!isSubPlugin && (
                <InputContainer
                    className="flex flex-col gap-6"
                    helpText={t(
                        'app.plugins.crisp.crispSetupGovernance.proposalDuration.helpText',
                    )}
                    id="proposalDuration"
                    label={t(
                        'app.plugins.crisp.crispSetupGovernance.proposalDuration.label',
                    )}
                    useCustomWrapper={true}
                >
                    <AdvancedDateInputDuration
                        defaultValue={voteDurationDefault}
                        field={`${formPrefix}.minDuration`}
                        infoText={t(
                            'app.plugins.crisp.crispSetupGovernance.proposalDuration.alertInfo',
                        )}
                        label={t(
                            'app.plugins.crisp.crispSetupGovernance.proposalDuration.label',
                        )}
                        minDuration={voteDurationMin}
                        useSecondsFormat={true}
                        validateMinDuration={true}
                    />
                </InputContainer>
            )}
            {showProposalCreationSettings && (
                <ProposalCreationEligibilityField
                    formPrefix={formPrefix}
                    token={membershipSettings.token}
                />
            )}
        </div>
    );
};
