import type { Hex } from 'viem';

/**
 * Parameters for the actions a plugin needs the DAO to run once its installation is applied, appended to the same
 * proposal. For plugins whose setup cannot take everything at installation, e.g. metadata the DAO sets afterwards.
 */
export interface IBuildInstalledPluginActionsParams {
    /**
     * Address of the installed plugin.
     */
    pluginAddress: Hex;
    /**
     * Pinned metadata of the plugin, in hex format.
     */
    metadata: Hex;
}
