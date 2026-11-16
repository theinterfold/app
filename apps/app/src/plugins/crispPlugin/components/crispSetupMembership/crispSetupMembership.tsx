'use client';

import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { zeroAddress } from 'viem';
import type { ITokenSetupMembershipProps } from '@/plugins/tokenPlugin/components/tokenSetupMembership';
import { TokenSetupMembershipImportToken } from '@/plugins/tokenPlugin/components/tokenSetupMembership/components/tokenSetupMembershipImportToken';

/**
 * CRISP is installed against an existing token that supports governance (IVotes), it neither
 * creates nor wraps a token.
 */
export const CrispSetupMembership: React.FC<ITokenSetupMembershipProps> = (
    props,
) => {
    const { formPrefix, daoId } = props;

    const { setValue, getValues } = useFormContext();
    const [isReset, setIsReset] = useState(false);

    // Resets the defaults of the token plugin form (a new token with the creator as only member).
    // The import form keeps the address it mounts with in its own state, so it only mounts once the
    // defaults are reset.
    useEffect(() => {
        const currentTokenAddress = getValues(`${formPrefix}.token.address`) as
            | string
            | undefined;

        if (!currentTokenAddress || currentTokenAddress === zeroAddress) {
            setValue(`${formPrefix}.token.address`, '');
            setValue(`${formPrefix}.token.name`, '');
            setValue(`${formPrefix}.token.symbol`, '');
            setValue(`${formPrefix}.token.totalSupply`, '0');
        }

        setValue(`${formPrefix}.members`, []);
        setIsReset(true);
    }, [formPrefix, getValues, setValue]);

    if (!isReset) {
        return null;
    }

    return (
        <TokenSetupMembershipImportToken
            daoId={daoId}
            disableWrapping={true}
            formPrefix={formPrefix}
        />
    );
};
