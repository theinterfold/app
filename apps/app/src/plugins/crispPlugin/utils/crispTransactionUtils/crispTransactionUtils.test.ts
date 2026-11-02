import { decodeAbiParameters, decodeFunctionData, type Hex } from 'viem';
import { Network } from '@/shared/api/daoService';
import { pluginTransactionUtils } from '@/shared/utils/pluginTransactionUtils';
import { crispE3Config } from '../../constants/crispE3Config';
import { generateCrispPluginSettings } from '../../testUtils';
import {
    crispPluginAbi,
    crispPluginSetupAbi,
    crispProposalParamsAbi,
} from './crispPluginAbi';
import {
    crispTransactionUtils,
    type IPrepareCrispInstallDataParams,
} from './crispTransactionUtils';

describe('crispTransaction utils', () => {
    const daoAddress = '0x1111111111111111111111111111111111111111';
    const tokenAddress = '0x2222222222222222222222222222222222222222';

    const buildSpy = jest.spyOn(
        pluginTransactionUtils,
        'buildPrepareInstallationData',
    );

    afterEach(() => {
        buildSpy.mockReset();
    });

    const buildInstallParams = (
        overrides?: Partial<IPrepareCrispInstallDataParams>,
    ) =>
        ({
            dao: { address: daoAddress, network: Network.ETHEREUM_SEPOLIA },
            metadata: '0x',
            body: {
                membership: {
                    // The members of an existing token are never minted to.
                    members: [],
                    token: {
                        address: tokenAddress,
                        name: 'Votes',
                        symbol: 'VTS',
                        totalSupply: '1000',
                        decimals: 18,
                    },
                },
                governance: {
                    minParticipation: 15,
                    supportThreshold: 66,
                    minProposerVotingPower: '2',
                    minVoterVotingPower: '3',
                    minDuration: 900,
                },
            },
            ...overrides,
        }) as unknown as IPrepareCrispInstallDataParams;

    // `buildPrepareInstallationData` receives the plugin setup data as its third argument.
    const getSetupData = (): Hex => buildSpy.mock.calls[0][2];

    describe('buildPrepareInstallData', () => {
        it('encodes the init params with the support threshold, the existing token and the EXECUTE grant', () => {
            crispTransactionUtils.buildPrepareInstallData(buildInstallParams());

            const [initParams, token, grantExecuteOnDao] = decodeAbiParameters(
                crispPluginSetupAbi,
                getSetupData(),
            );
            const e3Config = crispE3Config[Network.ETHEREUM_SEPOLIA]!;

            expect(token.toLowerCase()).toEqual(tokenAddress);
            expect(grantExecuteOnDao).toBeTruthy();
            expect(initParams.dao.toLowerCase()).toEqual(daoAddress);
            expect(initParams.token.toLowerCase()).toEqual(tokenAddress);
            expect(initParams.interfold).toEqual(e3Config.interfoldAddress);
            expect(initParams.crispProgramAddress).toEqual(
                e3Config.crispProgramAddress,
            );
            expect(initParams.computeProviderParams).toEqual(
                e3Config.computeProviderParams,
            );
            // Percentages are whole numbers out of 100 on-chain, in this order.
            expect(initParams.votingSettings).toEqual({
                minProposerVotingPower: BigInt(2) * BigInt(10) ** BigInt(18),
                minVoterVotingPower: BigInt(3) * BigInt(10) ** BigInt(18),
                minParticipation: 15,
                supportThreshold: 66,
                minDuration: BigInt(900),
            });
        });

        it('does not grant EXECUTE on the DAO to a body of a staged process', () => {
            crispTransactionUtils.buildPrepareInstallData(
                buildInstallParams({
                    stageVotingPeriod: { days: 0, hours: 0, minutes: 30 },
                }),
            );

            const [initParams, , grantExecuteOnDao] = decodeAbiParameters(
                crispPluginSetupAbi,
                getSetupData(),
            );

            expect(grantExecuteOnDao).toBeFalsy();
            // The stage window replaces the minimum duration of the form.
            expect(initParams.votingSettings.minDuration).toEqual(BigInt(1800));
        });

        it('throws on a network without an Interfold deployment', () => {
            expect(() =>
                crispTransactionUtils.buildPrepareInstallData(
                    buildInstallParams({
                        dao: {
                            address: daoAddress,
                            network: Network.ETHEREUM_MAINNET,
                        } as never,
                    }),
                ),
            ).toThrow();
        });
    });

    describe('buildCreateProposalData', () => {
        const buildProposalParams = (proposal: Record<string, unknown> = {}) =>
            ({
                metadata: '0x1234',
                actions: [],
                proposal: { minimumDuration: { minutes: 15 }, ...proposal },
                plugin: {
                    settings: generateCrispPluginSettings(),
                },
            }) as never;

        const decode = (data: Hex) => {
            const { args } = decodeFunctionData({
                abi: crispPluginAbi,
                data,
            });

            return args as unknown as [Hex, unknown[], bigint, bigint, Hex];
        };

        it('lets the contract pick both dates by default and sends the allow-failure map as data', () => {
            const data = crispTransactionUtils.buildCreateProposalData(
                buildProposalParams(),
            );
            const [metadata, actions, startDate, endDate, proposalParams] =
                decode(data);

            expect(metadata).toEqual('0x1234');
            expect(actions).toEqual([]);
            expect(startDate).toEqual(BigInt(0));
            expect(endDate).toEqual(BigInt(0));
            expect(
                decodeAbiParameters(crispProposalParamsAbi, proposalParams),
            ).toEqual([BigInt(0)]);
        });

        it('sends a concrete start together with an explicit end, never a zero start', () => {
            const data = crispTransactionUtils.buildCreateProposalData(
                buildProposalParams({
                    startTimeMode: 'now',
                    endTimeMode: 'duration',
                    endTimeDuration: { days: 1, hours: 0, minutes: 0 },
                }),
            );
            const [, , startDate, endDate] = decode(data);

            expect(startDate).toBeGreaterThan(BigInt(0));
            expect(endDate).toBeGreaterThan(startDate);
        });
    });

    describe('buildCreateProposalParams', () => {
        it('encodes the single allow-failure map word, not empty bytes', () => {
            // `createProposal` abi.decodes this as a uint256, so empty bytes revert.
            expect(crispTransactionUtils.buildCreateProposalParams()).toEqual(
                `0x${'0'.repeat(64)}`,
            );
        });
    });
});
