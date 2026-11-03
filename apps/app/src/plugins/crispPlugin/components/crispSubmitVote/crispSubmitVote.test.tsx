import { GukModulesProvider } from '@aragon/gov-ui-kit';
import { render, screen } from '@testing-library/react';
import { DateTime } from 'luxon';
import * as usePermissionCheckGuardHook from '@/modules/governance/hooks/usePermissionCheckGuard';
import * as dialogProvider from '@/shared/components/dialogProvider';
import * as useDaoPluginsHook from '@/shared/hooks/useDaoPlugins';
import {
    generateDaoPlugin,
    generateDialogContext,
    generateFilterComponentPlugin,
} from '@/shared/testUtils';
import { generateCrispProposal } from '../../testUtils';
import { CrispSubmitVote, type ICrispSubmitVoteProps } from './crispSubmitVote';

describe('<CrispSubmitVote /> component', () => {
    const useDialogContextSpy = jest.spyOn(dialogProvider, 'useDialogContext');
    const useDaoPluginsSpy = jest.spyOn(useDaoPluginsHook, 'useDaoPlugins');
    const usePermissionCheckGuardSpy = jest.spyOn(
        usePermissionCheckGuardHook,
        'usePermissionCheckGuard',
    );

    beforeEach(() => {
        useDialogContextSpy.mockReturnValue(generateDialogContext());
        useDaoPluginsSpy.mockReturnValue([
            generateFilterComponentPlugin({ meta: generateDaoPlugin() }),
        ]);
        usePermissionCheckGuardSpy.mockReturnValue({
            check: jest.fn(),
            result: true,
        });
    });

    afterEach(() => {
        useDialogContextSpy.mockReset();
        useDaoPluginsSpy.mockReset();
        usePermissionCheckGuardSpy.mockReset();
    });

    const createTestComponent = (props?: Partial<ICrispSubmitVoteProps>) => {
        const completeProps: ICrispSubmitVoteProps = {
            daoId: 'test-dao-id',
            proposal: generateCrispProposal(),
            ...props,
        };

        return (
            <GukModulesProvider>
                <CrispSubmitVote {...completeProps} />
            </GukModulesProvider>
        );
    };

    // Seconds relative to now
    const at = (offset: number) =>
        Math.round(DateTime.now().toSeconds()) + offset;

    it.each([
        {
            window: 'open',
            startDate: at(-60),
            endDate: at(3600),
            visible: true,
        },
        {
            window: 'not yet open',
            startDate: at(60),
            endDate: at(3600),
            visible: false,
        },
        {
            window: 'closed',
            startDate: at(-3600),
            endDate: at(-60),
            visible: false,
        },
    ])(
        'offers the vote only while the ballot window is open ($window)',
        ({ startDate, endDate, visible }) => {
            const proposal = generateCrispProposal({ startDate, endDate });
            render(createTestComponent({ proposal }));
            const button = screen.queryByRole('button', {
                name: /crispSubmitVote.buttons.vote/,
            });
            expect(button != null).toBe(visible);
        },
    );
});
