import * as governanceModule from '@/modules/governance/api/governanceService';
import { generateMember } from '@/modules/governance/testUtils';
import { Network } from '@/shared/api/daoService';
import {
    generatePaginatedResponse,
    generatePaginatedResponseMetadata,
} from '@/shared/testUtils';
import { crispRoundUtils } from '../crispRoundUtils';
import type { ICrispE3Record } from '../crispRoundUtils/crispRoundUtils';
import { crispMaskUtils } from './crispMaskUtils';

const pluginAddress = '0x00000000000000000000000000000000000000c3';
const programAddress = '0x00000000000000000000000000000000000000b2';

const members = [
    '0x0000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000002',
    '0x0000000000000000000000000000000000000003',
    '0x0000000000000000000000000000000000000004',
] as const;

describe('crispMask utils', () => {
    const randomValues = crypto.getRandomValues.bind(crypto);
    const getRandomValuesSpy = jest.spyOn(crypto, 'getRandomValues');
    const getMemberListSpy = jest.spyOn(
        governanceModule.governanceService,
        'getMemberList',
    );
    const readE3RecordSpy = jest.spyOn(crispRoundUtils, 'readE3Record');
    const readSlotPowerSpy = jest.spyOn(crispRoundUtils, 'readSlotVotingPower');

    // Hands out the given 32-bit draws in order.
    const mockDraws = (...draws: number[]) => {
        const queue = [...draws];

        getRandomValuesSpy.mockImplementation(((buffer: Uint32Array) => {
            buffer[0] = queue.shift() as number;

            return buffer;
        }) as never);
    };

    afterEach(() => {
        getRandomValuesSpy.mockReset();
        getMemberListSpy.mockReset();
        readE3RecordSpy.mockReset();
        readSlotPowerSpy.mockReset();
    });

    describe('drawIndex', () => {
        it('maps a draw onto the range by modulo', () => {
            mockDraws(7);

            expect(crispMaskUtils.drawIndex(3)).toEqual(1);
        });

        it('redraws a value in the uneven tail of the 32-bit range instead of favouring low indices', () => {
            // 2^32 mod 3 is 1, so the last value 2^32 - 1 would give index 0 one extra chance.
            mockDraws(2 ** 32 - 1, 5);

            expect(crispMaskUtils.drawIndex(3)).toEqual(2);
            expect(getRandomValuesSpy).toHaveBeenCalledTimes(2);
        });

        it('never redraws for a length that divides the range', () => {
            mockDraws(2 ** 32 - 1);

            expect(crispMaskUtils.drawIndex(4)).toEqual(3);
            expect(getRandomValuesSpy).toHaveBeenCalledTimes(1);
        });

        it.each([0, -1, 1.5])(
            'refuses to draw from a length of %s',
            (length) => {
                expect(() => crispMaskUtils.drawIndex(length)).toThrow();
            },
        );
    });

    describe('pickEligibleMember', () => {
        it('returns the drawn member when it is eligible', async () => {
            mockDraws(2);

            const picked = await crispMaskUtils.pickEligibleMember({
                members,
                isEligible: () => Promise.resolve(true),
            });

            expect(picked).toEqual(members[2]);
        });

        it('skips ineligible draws and picks among the rest', async () => {
            // Draws 1 then 0 on the shrinking list: members[1], then members[0].
            mockDraws(1, 0, 0, 0);
            const eligible = new Set<string>([members[3]]);

            const isEligible = jest.fn((member: string) =>
                Promise.resolve(eligible.has(member)),
            );
            const picked = await crispMaskUtils.pickEligibleMember({
                members,
                isEligible,
            });

            expect(picked).toEqual(members[3]);
            // Every member was drawn at most once.
            const checked = isEligible.mock.calls.map(([member]) => member);
            expect(new Set(checked).size).toEqual(checked.length);
        });

        it('redraws from the members left once the first batch holds no eligible member', async () => {
            const many = Array.from(
                { length: 12 },
                (_, index) =>
                    `0x${(index + 1).toString(16).padStart(40, '0')}` as const,
            );
            // Always the first remaining member: the batch is many[0..9], then many[10..11].
            mockDraws(...new Array(12).fill(0));

            const isEligible = jest.fn((member: string) =>
                Promise.resolve(member === many[11]),
            );
            const picked = await crispMaskUtils.pickEligibleMember({
                members: many,
                isEligible,
            });

            expect(picked).toEqual(many[11]);
            expect(isEligible).toHaveBeenCalledTimes(12);
        });

        it('returns undefined when no member is eligible', async () => {
            mockDraws(0, 0, 0, 0);

            await expect(
                crispMaskUtils.pickEligibleMember({
                    members,
                    isEligible: () => Promise.resolve(false),
                }),
            ).resolves.toBeUndefined();
        });

        it('returns undefined for an empty list without drawing', async () => {
            await expect(
                crispMaskUtils.pickEligibleMember({
                    members: [],
                    isEligible: () => Promise.resolve(true),
                }),
            ).resolves.toBeUndefined();
            expect(getRandomValuesSpy).not.toHaveBeenCalled();
        });

        it('throws a failed eligibility check instead of counting the member as ineligible', async () => {
            mockDraws(0);

            await expect(
                crispMaskUtils.pickEligibleMember({
                    members,
                    isEligible: () => Promise.reject(new Error('rpc down')),
                }),
            ).rejects.toThrow('rpc down');
        });

        it('picks every eligible member with the same frequency', async () => {
            getRandomValuesSpy.mockImplementation(randomValues as never);
            const counts = new Map<string, number>();
            const eligible = new Set<string>([members[0], members[2]]);
            const runs = 2000;

            for (let run = 0; run < runs; run++) {
                const picked = await crispMaskUtils.pickEligibleMember({
                    members,
                    isEligible: (member) =>
                        Promise.resolve(eligible.has(member)),
                });
                counts.set(picked!, (counts.get(picked!) ?? 0) + 1);
            }

            expect([...counts.keys()].sort()).toEqual([members[0], members[2]]);
            // Each should land near half of the runs, far inside five standard deviations.
            for (const count of counts.values()) {
                expect(Math.abs(count - runs / 2)).toBeLessThan(
                    5 * Math.sqrt(runs / 4),
                );
            }
        });
    });

    describe('fetchMembers', () => {
        it('reads every page of the member list of the body', async () => {
            getMemberListSpy
                .mockResolvedValueOnce(
                    generatePaginatedResponse({
                        data: [generateMember({ address: members[0] })],
                        metadata: generatePaginatedResponseMetadata({
                            page: 1,
                            totalPages: 2,
                        }),
                    }),
                )
                .mockResolvedValueOnce(
                    generatePaginatedResponse({
                        data: [generateMember({ address: members[1] })],
                        metadata: generatePaginatedResponseMetadata({
                            page: 2,
                            totalPages: 2,
                        }),
                    }),
                );

            const result = await crispMaskUtils.fetchMembers({
                daoId: 'dao-id',
                pluginAddress,
            });

            expect(result).toEqual([members[0], members[1]]);
            expect(getMemberListSpy).toHaveBeenCalledWith({
                queryParams: {
                    daoId: 'dao-id',
                    pluginAddress,
                    page: 2,
                    pageSize: 50,
                },
            });
        });

        it('lists a member once however its address is cased, and drops invalid addresses', async () => {
            getMemberListSpy.mockResolvedValue(
                generatePaginatedResponse({
                    data: [
                        generateMember({ address: members[0] }),
                        generateMember({ address: members[0].toUpperCase() }),
                        generateMember({ address: 'not-an-address' }),
                    ],
                    metadata: generatePaginatedResponseMetadata({
                        page: 1,
                        totalPages: 1,
                    }),
                }),
            );

            await expect(
                crispMaskUtils.fetchMembers({ daoId: 'dao-id', pluginAddress }),
            ).resolves.toEqual([members[0]]);
        });
    });

    describe('fetchMembers limit', () => {
        const fetchMembers = () =>
            crispMaskUtils.fetchMembers({ daoId: 'dao-id', pluginAddress });

        const mockTotalPages = (totalPages: number) =>
            getMemberListSpy.mockResolvedValue(
                generatePaginatedResponse({
                    data: [generateMember({ address: members[0] })],
                    metadata: generatePaginatedResponseMetadata({
                        page: 1,
                        totalPages,
                    }),
                }),
            );

        it('reads a list of the largest size it accepts', async () => {
            mockTotalPages(100);

            await expect(fetchMembers()).resolves.toEqual([members[0]]);
            expect(getMemberListSpy).toHaveBeenCalledTimes(100);
        });

        it('fails clearly, without reading further pages, above the largest list it accepts', async () => {
            mockTotalPages(101);

            await expect(fetchMembers()).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.tooManyMaskMembers',
                    params: { max: 5000 },
                }),
            );
            expect(getMemberListSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('pickMaskTarget', () => {
        const params = {
            network: Network.ETHEREUM_SEPOLIA,
            daoId: 'dao-id',
            pluginAddress: pluginAddress as `0x${string}`,
            e3Id: BigInt(7),
        };

        const mockMembers = (addresses: readonly string[]) =>
            getMemberListSpy.mockResolvedValue(
                generatePaginatedResponse({
                    data: addresses.map((address) =>
                        generateMember({ address }),
                    ),
                    metadata: generatePaginatedResponseMetadata({
                        page: 1,
                        totalPages: 1,
                    }),
                }),
            );

        beforeEach(() => {
            readE3RecordSpy.mockResolvedValue({
                programAddress,
            } as unknown as ICrispE3Record);
        });

        it('picks a member the program gives voting power in the round', async () => {
            mockMembers(members);
            mockDraws(0, 0, 0, 0);
            readSlotPowerSpy.mockImplementation(({ slot }) =>
                Promise.resolve(slot === members[3] ? BigInt(5) : BigInt(0)),
            );

            const target = await crispMaskUtils.pickMaskTarget(params);

            expect(target).toEqual(members[3]);
            expect(readSlotPowerSpy).toHaveBeenCalledWith({
                network: Network.ETHEREUM_SEPOLIA,
                programAddress,
                e3Id: BigInt(7),
                slot: members[0],
            });
        });

        it('refuses a body that has no member', async () => {
            mockMembers([]);

            await expect(crispMaskUtils.pickMaskTarget(params)).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.noMaskMembers',
                }),
            );
            expect(readSlotPowerSpy).not.toHaveBeenCalled();
        });

        it('refuses a body none of whose members holds voting power in the round', async () => {
            mockMembers(members);
            mockDraws(0, 0, 0, 0);
            readSlotPowerSpy.mockResolvedValue(BigInt(0));

            await expect(crispMaskUtils.pickMaskTarget(params)).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.noEligibleMaskMember',
                }),
            );
        });
    });
});
