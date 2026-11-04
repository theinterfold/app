import { generateTokenPluginSettingsToken } from '@/plugins/tokenPlugin/testUtils';
import { generateDaoPlugin } from '@/shared/testUtils';
import { generateCrispPluginSettings } from '../../testUtils';
import { crispBodyUtils } from './crispBodyUtils';

describe('crispBody utils', () => {
    describe('pluginToFormData', () => {
        it('sets the governance token as membership of the body', () => {
            const token = generateTokenPluginSettingsToken({ symbol: 'VTS' });
            const plugin = generateDaoPlugin({
                settings: generateCrispPluginSettings({ token }),
            });

            const result = crispBodyUtils.pluginToFormData({
                plugin,
                membership: { members: [] },
            });

            expect(result.membership).toEqual({ members: [], token });
        });
    });
});
