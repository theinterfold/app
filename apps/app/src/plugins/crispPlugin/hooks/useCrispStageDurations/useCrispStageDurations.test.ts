import { renderHook } from '@testing-library/react';
import { generateSppPluginSettings } from '@/plugins/sppPlugin/testUtils';
import type { ISppStage } from '@/plugins/sppPlugin/types';
import * as useDaoPluginsModule from '@/shared/hooks/useDaoPlugins';
import {
    generateDaoPlugin,
    generateFilterComponentPlugin,
} from '@/shared/testUtils';
import { useCrispStageDurations } from './useCrispStageDurations';

describe('useCrispStageDurations hook', () => {
    const useDaoPluginsSpy = jest.spyOn(useDaoPluginsModule, 'useDaoPlugins');

    const body = generateDaoPlugin({
        address: '0x00000000000000000000000000000000000000c3',
        parentPlugin: '0x00000000000000000000000000000000000000a1',
    });

    const stage = (voteDuration: number, bodyAddress: string) =>
        ({
            voteDuration,
            plugins: [generateDaoPlugin({ address: bodyAddress })],
        }) as ISppStage;

    afterEach(() => {
        useDaoPluginsSpy.mockReset();
    });

    it('returns the window of every stage the plugin is a body of', () => {
        const stages = [
            stage(3600, body.address),
            stage(7200, '0x00000000000000000000000000000000000000d4'),
            stage(86_400, body.address),
        ];
        const parent = generateDaoPlugin({
            settings: generateSppPluginSettings({ stages }),
        });
        useDaoPluginsSpy.mockReturnValue([
            generateFilterComponentPlugin({ meta: parent }),
        ]);

        const { result } = renderHook(() =>
            useCrispStageDurations({ daoId: 'dao', plugin: body }),
        );

        expect(result.current).toEqual({
            stageDurations: [3600, 86_400],
            areStagesResolved: true,
        });
    });

    it('is unresolved while the parent process is loading', () => {
        useDaoPluginsSpy.mockReturnValue(undefined);

        const { result } = renderHook(() =>
            useCrispStageDurations({ daoId: 'dao', plugin: body }),
        );

        expect(result.current.areStagesResolved).toBe(false);
    });

    it('returns no stage for a plugin installed on its own', () => {
        useDaoPluginsSpy.mockReturnValue(undefined);
        const plugin = generateDaoPlugin({ parentPlugin: undefined });

        const { result } = renderHook(() =>
            useCrispStageDurations({ daoId: 'dao', plugin }),
        );

        expect(result.current).toEqual({
            stageDurations: [],
            areStagesResolved: true,
        });
    });
});
