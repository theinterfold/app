import { addressUtils } from '@aragon/gov-ui-kit';
import { getAddress, type Hex } from 'viem';
import { governanceService } from '@/modules/governance/api/governanceService';
import type { Network } from '@/shared/api/daoService';
import { crispRoundUtils } from '../crispRoundUtils';

// Largest page the backend serves.
const memberPageSize = 50;

// Slots checked on-chain at once. A slot is checked in the order it was drawn, so checking several
// together costs nothing in uniformity and spares a round trip per ineligible member.
const eligibilityBatchSize = 10;

export interface IPickEligibleMemberParams {
    /**
     * Addresses to draw the mask target from.
     */
    members: readonly Hex[];
    /**
     * Resolves to whether the round accepts a ballot written to the address.
     */
    isEligible: (member: Hex) => Promise<boolean>;
}

export interface IPickMaskTargetParams {
    /**
     * Network of the round.
     */
    network: Network;
    /**
     * ID of the DAO the CRISP body belongs to.
     */
    daoId: string;
    /**
     * Address of the CRISP body, whose members are the candidates.
     */
    pluginAddress: Hex;
    /**
     * Identifier of the E3 round the mask is written to.
     */
    e3Id: bigint;
}

class CrispMaskUtils {
    /**
     * Draws an index in `[0, length)` uniformly. A modulo of a 32-bit draw favours the low indices
     * whenever the length is not a power of two, so draws in the uneven tail are rejected.
     */
    drawIndex = (length: number): number => {
        if (!Number.isInteger(length) || length < 1) {
            throw new Error('There is nothing to draw from.');
        }

        const range = 2 ** 32;
        const limit = range - (range % length);
        const buffer = new Uint32Array(1);

        let draw: number;

        do {
            crypto.getRandomValues(buffer);
            draw = buffer[0];
        } while (draw >= limit);

        return draw % length;
    };

    /**
     * Picks a member uniformly among the eligible ones. Members are drawn without replacement and
     * the first eligible draw wins, which is uniform over the eligible members, so an ineligible
     * draw is redrawn from the rest instead of failing the mask. A failed eligibility check is
     * thrown, never counted as an ineligible member.
     *
     * @returns The picked member, or undefined when none is eligible.
     */
    pickEligibleMember = async (
        params: IPickEligibleMemberParams,
    ): Promise<Hex | undefined> => {
        const { members, isEligible } = params;

        const remaining = [...members];

        while (remaining.length > 0) {
            const batch = Array.from(
                { length: Math.min(eligibilityBatchSize, remaining.length) },
                () => remaining.splice(this.drawIndex(remaining.length), 1)[0],
            );

            const eligibility = await Promise.all(batch.map(isEligible));
            const picked = eligibility.indexOf(true);

            if (picked !== -1) {
                return batch[picked];
            }
        }
    };

    /**
     * Reads the addresses of the members of a CRISP body from the governance backend, each once.
     */
    fetchMembers = async (params: {
        daoId: string;
        pluginAddress: string;
    }): Promise<Hex[]> => {
        const { daoId, pluginAddress } = params;

        const fetchPage = (page: number) =>
            governanceService.getMemberList({
                queryParams: {
                    daoId,
                    pluginAddress,
                    page,
                    pageSize: memberPageSize,
                },
            });

        const firstPage = await fetchPage(1);
        const otherPages = await Promise.all(
            Array.from(
                { length: Math.max(firstPage.metadata.totalPages - 1, 0) },
                (_, index) => fetchPage(index + 2),
            ),
        );

        const members = new Map<string, Hex>();

        for (const { address } of [firstPage, ...otherPages].flatMap(
            (page) => page.data,
        )) {
            if (addressUtils.isAddress(address)) {
                members.set(address.toLowerCase(), getAddress(address));
            }
        }

        return [...members.values()];
    };

    /**
     * Picks the slot to mask: a uniformly random member of the CRISP body whose voting power in the
     * round, read on-chain, is above zero, as the program refuses a mask to any other slot.
     *
     * @throws When the body has no member or none of them can be masked.
     */
    pickMaskTarget = async (params: IPickMaskTargetParams): Promise<Hex> => {
        const { network, daoId, pluginAddress, e3Id } = params;

        const members = await this.fetchMembers({ daoId, pluginAddress });

        if (members.length === 0) {
            throw new Error(
                'This round has no members yet, so there is no slot to mask.',
            );
        }

        const { programAddress } = await crispRoundUtils.readE3Record({
            network,
            pluginAddress,
            e3Id,
        });

        const target = await this.pickEligibleMember({
            members,
            isEligible: async (slot) =>
                (await crispRoundUtils.readSlotVotingPower({
                    network,
                    programAddress,
                    e3Id,
                    slot,
                })) > BigInt(0),
        });

        if (target == null) {
            throw new Error(
                'No member holds voting power in this round, so there is no slot to mask.',
            );
        }

        return target;
    };
}

export const crispMaskUtils = new CrispMaskUtils();
