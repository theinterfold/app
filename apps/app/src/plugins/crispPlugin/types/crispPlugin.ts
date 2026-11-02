import type { IDaoPlugin } from '@/shared/api/daoService';
import type { ICrispPluginSettings } from './crispPluginSettings';

export interface ICrispPlugin extends IDaoPlugin<ICrispPluginSettings> {}
