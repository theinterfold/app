import type { IDao, IDaoPlugin } from '@/shared/api/daoService';

export interface IGetUninstallHelpersParams<
    TPlugin extends IDaoPlugin = IDaoPlugin,
> {
    /**
     * Plugin to be uninstalled.
     */
    plugin: TPlugin;
    /**
     * DAO the plugin is installed on. Needed by plugins that read the helpers of their installation
     * from the backend, which are keyed by the network of the DAO.
     */
    dao: IDao;
}
