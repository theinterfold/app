import { Dialog, GukModulesProvider } from '@aragon/gov-ui-kit';
import { render, screen } from '@testing-library/react';
import { VoteOption } from '@/plugins/tokenPlugin/types';
import * as dialogProvider from '@/shared/components/dialogProvider';
import type { IUseDaoChainReturn } from '@/shared/hooks/useDaoChain';
import * as useDaoChainHook from '@/shared/hooks/useDaoChain';
import { generateDialogContext } from '@/shared/testUtils';
import { CrispPluginDialogId } from '../../constants/crispPluginDialogId';
import * as useCrispProposalModule from '../../hooks/useCrispProposal';
import type { IUseCrispSubmitVoteResult } from '../../hooks/useCrispSubmitVote';
import * as useCrispSubmitVoteModule from '../../hooks/useCrispSubmitVote';
import { generateCrispProposal } from '../../testUtils';
import { CrispError, CrispMaskTarget } from '../../types';
import {
    CrispSubmitVoteDialog,
    type ICrispSubmitVoteDialogProps,
} from './crispSubmitVoteDialog';

describe('<CrispSubmitVoteDialog /> component', () => {
    const useDialogContextSpy = jest.spyOn(dialogProvider, 'useDialogContext');
    const useDaoChainSpy = jest.spyOn(useDaoChainHook, 'useDaoChain');
    const useCrispProposalSpy = jest.spyOn(
        useCrispProposalModule,
        'useCrispProposal',
    );
    const useCrispSubmitVoteSpy = jest.spyOn(
        useCrispSubmitVoteModule,
        'useCrispSubmitVote',
    );

    const buildSubmitVoteResult = (
        result?: Partial<IUseCrispSubmitVoteResult>,
    ): IUseCrispSubmitVoteResult => ({
        submitVote: jest.fn(),
        activeStep: useCrispSubmitVoteModule.CrispSubmitVoteStep.ENCRYPT,
        state: 'idle',
        isRoundReady: true,
        hasActiveSlot: false,
        isVoteUpdate: false,
        isMask: false,
        isWalletSubmission: false,
        isLoading: false,
        ...result,
    });

    beforeEach(() => {
        useDialogContextSpy.mockReturnValue(generateDialogContext());
        useDaoChainSpy.mockReturnValue({
            buildEntityUrl: jest.fn(),
        } as unknown as IUseDaoChainReturn);
        useCrispProposalSpy.mockImplementation(({ proposal }) => ({
            proposal,
            isLoading: false,
        }));
        useCrispSubmitVoteSpy.mockReturnValue(buildSubmitVoteResult());
    });

    afterEach(() => {
        useDialogContextSpy.mockReset();
        useDaoChainSpy.mockReset();
        useCrispProposalSpy.mockReset();
        useCrispSubmitVoteSpy.mockReset();
    });

    const createTestComponent = (maskTarget?: CrispMaskTarget) => {
        const proposal = generateCrispProposal();
        const props: ICrispSubmitVoteDialogProps = {
            location: {
                id: CrispPluginDialogId.SUBMIT_VOTE,
                params:
                    maskTarget != null
                        ? { proposal, maskTarget, daoId: 'dao-id' }
                        : { proposal, voteOption: VoteOption.YES },
            },
        };

        return (
            <GukModulesProvider>
                <Dialog.Root open={true}>
                    <CrispSubmitVoteDialog {...props} />
                </Dialog.Root>
            </GukModulesProvider>
        );
    };

    it('renders a CRISP error from its translation key', () => {
        const error = new CrispError('app.plugins.crisp.testError', {
            params: { reason: 'reason' },
        });
        useCrispSubmitVoteSpy.mockReturnValue(
            buildSubmitVoteResult({ state: 'error', error }),
        );

        render(createTestComponent());

        expect(
            screen.getByText(`${error.errorKey} (reason=reason)`),
        ).toBeInTheDocument();
    });

    it('renders the message of any other error', () => {
        useCrispSubmitVoteSpy.mockReturnValue(
            buildSubmitVoteResult({
                state: 'error',
                error: new Error('User rejected the request.'),
            }),
        );

        render(createTestComponent());

        expect(
            screen.getByText('User rejected the request.'),
        ).toBeInTheDocument();
    });

    it('appends the reason the CRISP server gave for not serving the round', () => {
        useCrispSubmitVoteSpy.mockReturnValue(
            buildSubmitVoteResult({
                isRoundReady: false,
                roundError: new CrispError('app.plugins.crisp.testError'),
            }),
        );

        render(createTestComponent());

        expect(
            screen.getByText(/crispSubmitVoteDialog.alert.roundNotReady/),
        ).toHaveTextContent(/\(app.plugins.crisp.testError\)/);
    });

    const directMethod =
        'app.plugins.crisp.crispSubmitVoteDialog.method.direct';
    const relayMethod = 'app.plugins.crisp.crispSubmitVoteDialog.method.relay';

    it.each([
        { name: 'a vote', maskTarget: undefined },
        { name: 'a mask of the own slot', maskTarget: CrispMaskTarget.SELF },
    ])('lets the voter send $name from the wallet', ({ maskTarget }) => {
        render(createTestComponent(maskTarget));

        expect(screen.getByText(relayMethod)).toBeInTheDocument();
        expect(screen.getByText(directMethod)).toBeInTheDocument();
    });

    it('offers no choice of who sends a mask of a random member, which only the relay sends', () => {
        render(createTestComponent(CrispMaskTarget.RANDOM));

        expect(screen.queryByText(relayMethod)).not.toBeInTheDocument();
        expect(screen.queryByText(directMethod)).not.toBeInTheDocument();
    });
});
