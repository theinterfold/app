import * as wagmiActions from 'wagmi/actions';
import { Network } from '@/shared/api/daoService';
import { crispE3Config } from '../../constants/crispE3Config';
import { crispRoundUtils } from './crispRoundUtils';

const interfold = crispE3Config[Network.ETHEREUM_SEPOLIA]!.interfoldAddress;
const program = '0x00000000000000000000000000000000000000b2';
const plugin = '0x00000000000000000000000000000000000000c3';
const slot = '0x00000000000000000000000000000000000000d4';

describe('crispRound utils', () => {
    const readContractSpy = jest.spyOn(wagmiActions, 'readContract');

    const now = 1_700_000_000;

    const mockChain = (overrides?: Partial<Record<string, unknown>>): void => {
        const values: Record<string, unknown> = {
            interfold,
            getE3: {
                e3Program: program,
                inputWindow: [BigInt(now - 100), BigInt(now + 1000)],
                committeePublicKey: '0x12',
                paramSet: 1,
            },
            censusModeOf: 2,
            votingPowerOf: BigInt(5),
            inputCommitmentDeadline: BigInt(now + 500),
            paramSetRegistry: '0xabcd',
            snapshotOf: BigInt(42),
            votingPowerDivisorOf: BigInt(10),
            getPastVotes: BigInt(55),
            ...overrides,
        };

        readContractSpy.mockImplementation((_config, parameters) => {
            const { functionName } = parameters;

            return Promise.resolve(values[functionName]) as never;
        });
    };

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
    });

    afterEach(() => {
        readContractSpy.mockReset();
        (Date.now as jest.Mock).mockRestore();
    });

    describe('readE3Record', () => {
        it('resolves the program from the E3 record read through the plugin coordinator', async () => {
            mockChain();

            const record = await crispRoundUtils.readE3Record({
                network: Network.ETHEREUM_SEPOLIA,
                pluginAddress: plugin,
                e3Id: BigInt(7),
            });

            expect(record.interfoldAddress).toEqual(interfold);
            expect(record.programAddress).toEqual(program);
            expect(record.committeeKeyCommitment).toEqual('0x12');
        });

        it('refuses a plugin bound to a coordinator other than the configured one', async () => {
            mockChain({
                interfold: '0x00000000000000000000000000000000000000a1',
            });

            await expect(
                crispRoundUtils.readE3Record({
                    network: Network.ETHEREUM_SEPOLIA,
                    pluginAddress: plugin,
                    e3Id: BigInt(7),
                }),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.interfoldUnexpected',
                }),
            );
            expect(readContractSpy).toHaveBeenCalledTimes(1);
        });

        it('refuses a network without a configured coordinator', async () => {
            mockChain();

            await expect(
                crispRoundUtils.readE3Record({
                    network: Network.ETHEREUM_MAINNET,
                    pluginAddress: plugin,
                    e3Id: BigInt(7),
                }),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.interfoldUnexpected',
                }),
            );
        });
    });

    describe('readVotingPower', () => {
        it('reads the raw power at the snapshot the program recorded', async () => {
            mockChain();

            const result = await crispRoundUtils.readVotingPower({
                network: Network.ETHEREUM_SEPOLIA,
                programAddress: program,
                tokenAddress: '0x00000000000000000000000000000000000000e5',
                e3Id: BigInt(7),
                slot,
            });

            expect(result).toEqual({
                ballotVotingPower: BigInt(5),
                rawVotingPower: BigInt(55),
                votingPowerDivisor: BigInt(10),
            });
            const pastVotesCall = readContractSpy.mock.calls
                .map((call) => call[1])
                .find(
                    (parameters) => parameters.functionName === 'getPastVotes',
                );

            expect(pastVotesCall).toEqual(
                expect.objectContaining({ args: [slot, BigInt(42)] }),
            );
        });
    });

    describe('readSlotVotingPower', () => {
        it('reads the spendable voting power of the slot from the program', async () => {
            mockChain({ votingPowerOf: BigInt(9) });

            const result = await crispRoundUtils.readSlotVotingPower({
                network: Network.ETHEREUM_SEPOLIA,
                programAddress: program,
                e3Id: BigInt(7),
                slot,
            });

            expect(result).toEqual(BigInt(9));
            expect(readContractSpy.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    address: program,
                    functionName: 'votingPowerOf',
                    args: [BigInt(7), slot],
                }),
            );
        });
    });

    describe('readBallotContext', () => {
        const params = {
            network: Network.ETHEREUM_SEPOLIA,
            pluginAddress: plugin as `0x${string}`,
            e3Id: BigInt(7),
            slot: slot as `0x${string}`,
        };

        it('returns the context of a round the voter can vote in', async () => {
            mockChain();

            const context = await crispRoundUtils.readBallotContext(params);

            expect(context.programAddress).toEqual(program);
            expect(context.votingPower).toEqual(BigInt(5));
            expect(context.encodedParams).toEqual('0xabcd');
        });

        it('refuses a round that is not read on-chain', async () => {
            mockChain({ censusModeOf: 0 });

            await expect(
                crispRoundUtils.readBallotContext(params),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.censusNotOnchain',
                }),
            );
        });

        it('refuses a voter without voting power before any proving starts', async () => {
            mockChain({ votingPowerOf: BigInt(0) });

            await expect(
                crispRoundUtils.readBallotContext(params),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.noVotingPower',
                }),
            );
        });

        it('words the refusal of a mask target without voting power so it does not blame the voter', async () => {
            mockChain({ votingPowerOf: BigInt(0) });

            await expect(
                crispRoundUtils.readBallotContext({
                    ...params,
                    isOwnSlot: false,
                }),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.noVotingPowerMaskTarget',
                }),
            );
        });

        it('refuses a ballot before the input window opens', async () => {
            mockChain({
                getE3: {
                    e3Program: program,
                    inputWindow: [BigInt(now + 10), BigInt(now + 1000)],
                    committeePublicKey: '0x12',
                    paramSet: 1,
                },
            });

            await expect(
                crispRoundUtils.readBallotContext(params),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.votingNotStarted',
                }),
            );
        });

        it('refuses a ballot after the commitment deadline', async () => {
            mockChain({ inputCommitmentDeadline: BigInt(now) });

            await expect(
                crispRoundUtils.readBallotContext(params),
            ).rejects.toThrow(
                expect.objectContaining({
                    errorKey:
                        'app.plugins.crisp.crispSubmitVoteDialog.error.deadlinePassed',
                }),
            );
        });
    });
});
