import { act, renderHook } from '@testing-library/react';
import { PluginInterfaceType } from '@/shared/api/daoService';
import type { ITransactionDialogStep } from '@/shared/components/transactionDialog';
import { generateDao, generateDaoPlugin } from '@/shared/testUtils';
import { pluginRegistryUtils } from '@/shared/utils/pluginRegistryUtils';
import { GovernanceSlotId } from '../../constants/moduleSlots';
import { useProposalPrerequisiteSteps } from './useProposalPrerequisiteSteps';

describe('useProposalPrerequisiteSteps hook', () => {
    const getSlotFunctionSpy = jest.spyOn(
        pluginRegistryUtils,
        'getSlotFunction',
    );

    afterEach(() => {
        getSlotFunctionSpy.mockReset();
    });

    const processAddress = '0x00000000000000000000000000000000000000a1';
    const bodyAddress = '0x00000000000000000000000000000000000000b1';

    const process = generateDaoPlugin({
        address: processAddress,
        interfaceType: PluginInterfaceType.SPP,
    });
    const body = generateDaoPlugin({
        address: bodyAddress,
        interfaceType: PluginInterfaceType.LOCK_TO_VOTE,
        parentPlugin: processAddress,
    });
    const dao = generateDao({ plugins: [process, body] });

    const generateStep = (id: string): ITransactionDialogStep => ({
        id,
        order: 0,
        meta: { label: id, errorLabel: id, state: 'idle', action: jest.fn() },
    });

    const registerSlots = (
        slots: Partial<
            Record<PluginInterfaceType, { headroom?: number; steps?: boolean }>
        >,
    ) =>
        getSlotFunctionSpy.mockImplementation(({ slotId, pluginId }) => {
            const slot = slots[pluginId as PluginInterfaceType];

            if (
                slotId ===
                    GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_GAS_HEADROOM &&
                slot?.headroom != null
            ) {
                return () => slot.headroom;
            }

            if (
                slotId ===
                    GovernanceSlotId.GOVERNANCE_CREATE_PROPOSAL_PREREQUISITE_STEPS &&
                slot?.steps
            ) {
                return () => ({ steps: [], isResolved: true });
            }

            return undefined;
        });

    it('uses the largest gas headroom required by the process and its bodies', () => {
        registerSlots({
            [PluginInterfaceType.SPP]: { headroom: 10 },
            [PluginInterfaceType.LOCK_TO_VOTE]: { headroom: 25 },
        });

        const { result } = renderHook(() =>
            useProposalPrerequisiteSteps({ dao, plugin: process }),
        );

        expect(result.current.gasHeadroom).toEqual(25);
    });

    it('lists only the plugins that register prerequisite steps', () => {
        registerSlots({ [PluginInterfaceType.LOCK_TO_VOTE]: { steps: true } });

        const { result } = renderHook(() =>
            useProposalPrerequisiteSteps({ dao, plugin: process }),
        );

        expect(
            result.current.prerequisitePlugins.map((item) => item.plugin),
        ).toEqual([body]);
    });

    it('is resolved without prerequisite plugins', () => {
        registerSlots({});

        const { result } = renderHook(() =>
            useProposalPrerequisiteSteps({ dao, plugin: process }),
        );

        expect(result.current.arePrerequisitesResolved).toBe(true);
        expect(result.current.prerequisiteSteps).toEqual([]);
    });

    it('resolves only once every prerequisite plugin reported its final steps', () => {
        registerSlots({
            [PluginInterfaceType.SPP]: { steps: true },
            [PluginInterfaceType.LOCK_TO_VOTE]: { steps: true },
        });

        const { result } = renderHook(() =>
            useProposalPrerequisiteSteps({ dao, plugin: process }),
        );
        expect(result.current.arePrerequisitesResolved).toBe(false);

        act(() =>
            result.current.onChange(processAddress, {
                steps: [],
                isResolved: true,
            }),
        );
        expect(result.current.arePrerequisitesResolved).toBe(false);

        act(() =>
            result.current.onChange(bodyAddress, {
                steps: [],
                isResolved: false,
            }),
        );
        expect(result.current.arePrerequisitesResolved).toBe(false);

        act(() =>
            result.current.onChange(bodyAddress, {
                steps: [],
                isResolved: true,
            }),
        );
        expect(result.current.arePrerequisitesResolved).toBe(true);
    });

    it('lists the reported steps in the order of the plugins and keeps the others when one plugin reports again', () => {
        registerSlots({
            [PluginInterfaceType.SPP]: { steps: true },
            [PluginInterfaceType.LOCK_TO_VOTE]: { steps: true },
        });
        const { result } = renderHook(() =>
            useProposalPrerequisiteSteps({ dao, plugin: process }),
        );

        act(() =>
            result.current.onChange(bodyAddress, {
                steps: [generateStep('BODY_STEP')],
                isResolved: true,
            }),
        );
        act(() =>
            result.current.onChange(processAddress, {
                steps: [generateStep('PROCESS_STEP')],
                isResolved: true,
            }),
        );
        expect(result.current.prerequisiteSteps.map((step) => step.id)).toEqual(
            ['PROCESS_STEP', 'BODY_STEP'],
        );

        act(() =>
            result.current.onChange(processAddress, {
                steps: [generateStep('NEW_PROCESS_STEP')],
                isResolved: true,
            }),
        );
        expect(result.current.prerequisiteSteps.map((step) => step.id)).toEqual(
            ['NEW_PROCESS_STEP', 'BODY_STEP'],
        );
    });

    it('keeps the identity of the plugins and the steps across renders', () => {
        registerSlots({ [PluginInterfaceType.LOCK_TO_VOTE]: { steps: true } });

        const { result, rerender } = renderHook(() =>
            useProposalPrerequisiteSteps({ dao, plugin: process }),
        );
        act(() =>
            result.current.onChange(bodyAddress, {
                steps: [generateStep('BODY_STEP')],
                isResolved: true,
            }),
        );
        const { prerequisitePlugins, prerequisiteSteps, onChange } =
            result.current;

        rerender();

        expect(result.current.prerequisitePlugins).toBe(prerequisitePlugins);
        expect(result.current.prerequisiteSteps).toBe(prerequisiteSteps);
        expect(result.current.onChange).toBe(onChange);
    });
});
