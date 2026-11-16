import { Network } from '@/shared/api/daoService';
import { networkDefinitions } from '@/shared/constants/networkDefinitions';
import { generateDao, generateDaoPlugin } from '@/shared/testUtils';
import { pluginRegistryUtils } from '@/shared/utils/pluginRegistryUtils';
import { pluginTransactionUtils } from '@/shared/utils/pluginTransactionUtils';
import { preparePluginUninstallationDialogUtils } from './preparePluginUninstallationDialogUtils';

describe('preparePluginUninstallationDialog utils', () => {
    const getSlotFunctionSpy = jest.spyOn(
        pluginRegistryUtils,
        'getSlotFunction',
    );
    const buildPrepareUninstallDataSpy = jest.spyOn(
        pluginTransactionUtils,
        'buildPrepareUninstallData',
    );

    beforeEach(() => {
        buildPrepareUninstallDataSpy.mockReturnValue('0xdata');
    });

    afterEach(() => {
        getSlotFunctionSpy.mockReset();
        buildPrepareUninstallDataSpy.mockReset();
    });

    describe('buildPrepareUninstallationTransaction', () => {
        const dao = generateDao({ network: Network.ETHEREUM_SEPOLIA });
        const plugin = generateDaoPlugin();
        const helper = '0x4444444444444444444444444444444444444444';

        it('prepares the uninstallation with the helpers resolved by an asynchronous slot function', async () => {
            const getHelpers = jest.fn().mockResolvedValue([helper]);
            getSlotFunctionSpy.mockReturnValue(getHelpers);

            const transaction =
                await preparePluginUninstallationDialogUtils.buildPrepareUninstallationTransaction(
                    dao,
                    plugin,
                );

            expect(getHelpers).toHaveBeenCalledWith({ plugin, dao });
            expect(buildPrepareUninstallDataSpy).toHaveBeenCalledWith(
                dao,
                plugin,
                [helper],
                '0x',
            );
            expect(transaction).toEqual({
                data: '0xdata',
                value: BigInt(0),
                to: networkDefinitions[Network.ETHEREUM_SEPOLIA].addresses
                    .pluginSetupProcessor,
            });
        });

        it('prepares the uninstallation with the helpers returned by a synchronous slot function', async () => {
            getSlotFunctionSpy.mockReturnValue(() => [helper]);

            await preparePluginUninstallationDialogUtils.buildPrepareUninstallationTransaction(
                dao,
                plugin,
            );

            expect(buildPrepareUninstallDataSpy).toHaveBeenCalledWith(
                dao,
                plugin,
                [helper],
                '0x',
            );
        });

        it('prepares the uninstallation without helpers when the plugin registers no slot function', async () => {
            getSlotFunctionSpy.mockReturnValue(undefined);

            await preparePluginUninstallationDialogUtils.buildPrepareUninstallationTransaction(
                dao,
                plugin,
            );

            expect(buildPrepareUninstallDataSpy).toHaveBeenCalledWith(
                dao,
                plugin,
                [],
                '0x',
            );
        });
    });
});
