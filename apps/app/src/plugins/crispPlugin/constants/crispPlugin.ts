import { Network, PluginInterfaceType } from '@/shared/api/daoService';
import type { IPluginInfo } from '@/shared/types';

export const crispPlugin: IPluginInfo = {
    id: PluginInterfaceType.CRISP,
    subdomain: 'crisp-voting',
    name: 'CRISP',
    installVersion: {
        release: 1,
        build: 1,
        releaseNotes:
            'https://github.com/gnosisguild/crisp-aragon-plugin/releases/tag/v1.1',
        description:
            'This is the initial release of the CRISP private voting plugin.',
    },
    // The plugin is hidden on networks with a zero repository address, it needs a live Interfold
    // deployment (see crispE3Config)
    repositoryAddresses: {
        [Network.ARBITRUM_MAINNET]:
            '0x0000000000000000000000000000000000000000',
        [Network.AVAX_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.BASE_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.CHILIZ_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.CITREA_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.ETHEREUM_MAINNET]:
            '0x0000000000000000000000000000000000000000',
        [Network.ETHEREUM_SEPOLIA]:
            '0x31a30A55bc3E118C0f5505467EeBed193112Faba',
        [Network.HEMI_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.KATANA_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.MONAD_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.OPTIMISM_MAINNET]:
            '0x0000000000000000000000000000000000000000',
        [Network.POLYGON_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.ZKSYNC_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.ROBINHOOD_MAINNET]:
            '0x0000000000000000000000000000000000000000',
        [Network.BNB_MAINNET]: '0x0000000000000000000000000000000000000000',
        [Network.BNB_TESTNET]: '0x0000000000000000000000000000000000000000',
        [Network.ETHEREUM_HOODI]: '0x0000000000000000000000000000000000000000',
        [Network.BASE_SEPOLIA]: '0x0000000000000000000000000000000000000000',
        [Network.POLYGON_AMOY]: '0x0000000000000000000000000000000000000000',
    },
    setup: {
        nameKey: 'app.plugins.crisp.meta.setup.name',
        descriptionKey: 'app.plugins.crisp.meta.setup.description',
    },
};
