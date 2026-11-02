import { InputNumber } from '@aragon/gov-ui-kit';
import { useTranslations } from '@/shared/components/translationsProvider';
import { useFormField } from '@/shared/hooks/useFormField';
import type { ICrispPluginSettings } from '../../types';

export interface ICrispMinVoterVotingPowerFieldProps {
    /**
     * Prefix to be prepended to the form field.
     */
    formPrefix: string;
    /**
     * The token linked to the plugin.
     */
    token: Pick<ICrispPluginSettings['token'], 'symbol'>;
}

export const CrispMinVoterVotingPowerField: React.FC<
    ICrispMinVoterVotingPowerFieldProps
> = (props) => {
    const { formPrefix, token } = props;

    const { t } = useTranslations();

    const { value, onChange, ...field } = useFormField<
        Record<string, ICrispPluginSettings['minVoterVotingPower']>,
        'minVoterVotingPower'
    >('minVoterVotingPower', {
        fieldPrefix: formPrefix,
        defaultValue: '0',
        label: t('app.plugins.crisp.crispMinVoterVotingPowerField.label'),
    });

    return (
        <InputNumber
            {...field}
            helpText={t(
                'app.plugins.crisp.crispMinVoterVotingPowerField.helpText',
            )}
            label={t('app.plugins.crisp.crispMinVoterVotingPowerField.label')}
            onChange={onChange}
            prefix="≥"
            suffix={token.symbol}
            value={value}
        />
    );
};
