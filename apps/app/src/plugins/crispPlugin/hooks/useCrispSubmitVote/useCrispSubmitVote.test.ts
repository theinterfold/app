import { act, renderHook, waitFor } from '@testing-library/react';
import * as wagmi from 'wagmi';
import { generateTokenPluginSettingsToken } from '@/plugins/tokenPlugin/testUtils';
import { VoteOption } from '@/plugins/tokenPlugin/types';
import { Network } from '@/shared/api/daoService';
import type { ICrispRoundState } from '../../api/crispService';
import * as CrispService from '../../api/crispService';
import { crispService } from '../../api/crispService';
import {
    generateCrispPluginSettings,
    generateCrispProposal,
} from '../../testUtils';
import { CrispSubmitVoteMethod } from '../../types';
import { crispBallotWeightUtils } from '../../utils/crispBallotWeightUtils';
import { crispRoundUtils } from '../../utils/crispRoundUtils';
import { crispSdkUtils } from '../../utils/crispSdkUtils';
import * as CrispVotingPower from '../useCrispVotingPower';
import { useCrispSubmitVote } from './useCrispSubmitVote';

describe('useCrispSubmitVote', () => {
    const useRoundStateSpy = jest.spyOn(CrispService, 'useCrispRoundState');
    const useVoteStatusSpy = jest.spyOn(CrispService, 'useCrispVoteStatus');
    const readContextSpy = jest.spyOn(crispRoundUtils, 'readBallotContext');
    const readDigestSpy = jest.spyOn(crispRoundUtils, 'readBallotDigest');
    const verifyKeySpy = jest.spyOn(crispSdkUtils, 'verifyCommitteeKey');
    const prepareBallotSpy = jest.spyOn(crispSdkUtils, 'prepareBallot');
    const finishBallotSpy = jest.spyOn(crispSdkUtils, 'finishBallot');
    const broadcastSpy = jest.spyOn(crispService, 'broadcastBallot');
    const availabilitySpy = jest.spyOn(crispService, 'getVoteAvailability');
    const getServerUrlSpy = jest.spyOn(crispService, 'getServerUrl');
    const useVotingPowerSpy = jest.spyOn(
        CrispVotingPower,
        'useCrispVotingPower',
    );
    const refetchVotingPowerSpy = jest.fn();
    const chooseWeightSpy = jest.spyOn(crispBallotWeightUtils, 'chooseWeight');
    // `useWalletAccount` is a thin wrapper over this, so mocking it covers the address the hook reads.
    const useConnectionSpy = jest.spyOn(wagmi, 'useConnection');
    const useSignTypedDataSpy = jest.spyOn(wagmi, 'useSignTypedData');
    const useSwitchChainSpy = jest.spyOn(wagmi, 'useSwitchChain');
    const useWriteContractSpy = jest.spyOn(wagmi, 'useWriteContract');
    const useWaitForReceiptSpy = jest.spyOn(
        wagmi,
        'useWaitForTransactionReceipt',
    );

    const signTypedDataAsync = jest.fn();
    const switchChainAsync = jest.fn();
    const writeContractAsync = jest.fn();

    const address = '0x1111111111111111111111111111111111111111';
    const programAddress = '0x2222222222222222222222222222222222222222';
    const signature = `0x${'ab'.repeat(65)}`;
    const attestedPayload = '0xattested';

    // A round id beyond the safe integer range: it must reach the SDK and the contracts exactly.
    const e3Id =
        '41376546203487432478123123123123123123123123123123123123123123123123123123123';

    const proposal = generateCrispProposal({
        e3Id,
        network: Network.ETHEREUM_SEPOLIA,
        settings: generateCrispPluginSettings({
            token: generateTokenPluginSettingsToken({ decimals: 18 }),
        }),
    });

    const buildRoundState = (
        overrides?: Partial<ICrispRoundState>,
    ): ICrispRoundState => ({
        status: 'Active',
        committee_public_key: [1, 2, 3],
        ...overrides,
    });

    const mockQueries = (params?: { roundState?: ICrispRoundState }) => {
        useRoundStateSpy.mockReturnValue({
            data: params?.roundState ?? buildRoundState(),
            isLoading: false,
        } as unknown as ReturnType<typeof CrispService.useCrispRoundState>);
        useVoteStatusSpy.mockReturnValue({
            data: { slot_active: false },
            isLoading: false,
        } as unknown as ReturnType<typeof CrispService.useCrispVoteStatus>);
    };

    beforeEach(() => {
        getServerUrlSpy.mockReturnValue('https://crisp.test');
        useVotingPowerSpy.mockReturnValue({
            votingPower: {
                ballotVotingPower: BigInt(300),
                rawVotingPower: BigInt(3000),
                votingPowerDivisor: BigInt(10),
            },
            isLoading: false,
            refetch: refetchVotingPowerSpy,
        });
        chooseWeightSpy.mockImplementation((available, randomize) =>
            randomize ? BigInt(298) : available,
        );
        useConnectionSpy.mockReturnValue({
            address,
            chainId: 11_155_111,
        } as unknown as wagmi.UseConnectionReturnType);
        useSignTypedDataSpy.mockReturnValue({
            signTypedDataAsync,
        } as unknown as wagmi.UseSignTypedDataReturnType);
        useSwitchChainSpy.mockReturnValue({
            mutateAsync: switchChainAsync,
        } as unknown as wagmi.UseSwitchChainReturnType);
        useWriteContractSpy.mockReturnValue({
            writeContractAsync,
        } as unknown as wagmi.UseWriteContractReturnType);
        useWaitForReceiptSpy.mockReturnValue({
            data: undefined,
        } as unknown as wagmi.UseWaitForTransactionReceiptReturnType);
        writeContractAsync.mockResolvedValue('0xtxhash');
        signTypedDataAsync.mockResolvedValue(signature);
        readContextSpy.mockResolvedValue({
            interfoldAddress: '0x3333333333333333333333333333333333333333',
            programAddress,
            inputWindow: [BigInt(0), BigInt(10)],
            committeeKeyCommitment: '0x12',
            paramSet: 1,
            votingPower: BigInt(300),
            commitmentDeadline: BigInt(10),
            encodedParams: '0x34',
        });
        readDigestSpy.mockResolvedValue('0xdigest');
        verifyKeySpy.mockResolvedValue('insecure-64');
        prepareBallotSpy.mockResolvedValue({
            ctCommitment: '0xcommitment',
        } as unknown as Awaited<
            ReturnType<typeof crispSdkUtils.prepareBallot>
        >);
        finishBallotSpy.mockResolvedValue('0xclientproof');
        broadcastSpy.mockResolvedValue({
            status: 'success',
            tx_hash: '0xhash',
            job_id: null,
            encoded_proof: null,
            message: null,
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('reports the round as not ready until the committee key is published', () => {
        mockQueries({
            roundState: buildRoundState({ committee_public_key: [] }),
        });

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        expect(result.current.isRoundReady).toBeFalsy();
    });

    it('reports the round as not ready when it is no longer active', () => {
        mockQueries({ roundState: buildRoundState({ status: 'Ended' }) });

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        expect(result.current.isRoundReady).toBeFalsy();
    });

    it('encrypts, signs the typed ballot, proves and stages it with the server', async () => {
        mockQueries();

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('success'));

        expect(verifyKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({
                publicKey: Uint8Array.from([1, 2, 3]),
                committeeKeyCommitment: '0x12',
            }),
        );
        expect(prepareBallotSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                e3Id: BigInt(e3Id),
                slotAddress: address,
                votingPower: BigInt(300),
                preset: 'insecure-64',
            }),
        );
        expect(signTypedDataAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                primaryType: 'Ballot',
                message: {
                    e3Id: BigInt(e3Id),
                    slot: address,
                    ciphertextCommitment: '0xcommitment',
                },
            }),
        );
        expect(finishBallotSpy).toHaveBeenCalledWith({
            prepared: expect.anything(),
            digest: '0xdigest',
            signature,
        });
        expect(broadcastSpy).toHaveBeenCalledWith({
            network: Network.ETHEREUM_SEPOLIA,
            e3Id,
            encodedProof: '0xclientproof',
            sendFromWallet: false,
        });
        expect(result.current.transactionHash).toEqual('0xhash');
        expect(writeContractAsync).not.toHaveBeenCalled();
    });

    it('puts the voting power on the CRISP index of the chosen option, not the Aragon one', async () => {
        mockQueries();

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.NO }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('success'));

        // CRISP orders the options yes, no, abstain, so a NO ballot puts the weight in the middle.
        expect(prepareBallotSpy).toHaveBeenCalledWith(
            expect.objectContaining({ vote: [0, 298, 0] }),
        );
    });

    it('asks the server to send the commitment from the wallet on the direct path', async () => {
        mockQueries();
        broadcastSpy.mockResolvedValue({
            status: 'ready_for_commitment',
            tx_hash: null,
            job_id: 'job-1',
            encoded_proof: attestedPayload,
            message: null,
        });

        const { result } = renderHook(() =>
            useCrispSubmitVote({
                proposal,
                voteOption: VoteOption.YES,
                method: CrispSubmitVoteMethod.DIRECT,
            }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(writeContractAsync).toHaveBeenCalled());

        expect(broadcastSpy).toHaveBeenCalledWith(
            expect.objectContaining({ sendFromWallet: true }),
        );
        // The server-attested payload is what reaches the program, never the client proof.
        expect(writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                address: programAddress,
                functionName: 'publishInput',
                args: [BigInt(e3Id), attestedPayload],
            }),
        );
        expect(result.current.isWalletSubmission).toBe(true);
    });

    it('settles a wallet submission when its receipt is mined', async () => {
        mockQueries();
        broadcastSpy.mockResolvedValue({
            status: 'ready_for_commitment',
            tx_hash: null,
            job_id: 'job-1',
            encoded_proof: attestedPayload,
            message: null,
        });
        useWaitForReceiptSpy.mockReturnValue({
            data: { status: 'success' },
        } as unknown as wagmi.UseWaitForTransactionReceiptReturnType);

        const { result } = renderHook(() =>
            useCrispSubmitVote({
                proposal,
                voteOption: VoteOption.YES,
                method: CrispSubmitVoteMethod.DIRECT,
            }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('success'));

        expect(result.current.transactionHash).toEqual('0xtxhash');
    });

    it('falls back to the wallet when the relay hands the ballot back', async () => {
        mockQueries();
        broadcastSpy.mockResolvedValue({
            status: 'pending_commitment',
            tx_hash: null,
            job_id: 'job-1',
            encoded_proof: null,
            message: null,
        });
        availabilitySpy.mockResolvedValue({
            status: 'ready_for_commitment',
            tx_hash: null,
            job_id: 'job-1',
            encoded_proof: attestedPayload,
            message: null,
        });

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(writeContractAsync).toHaveBeenCalled());

        expect(availabilitySpy).toHaveBeenCalledWith({
            network: Network.ETHEREUM_SEPOLIA,
            jobId: 'job-1',
        });
        expect(result.current.isWalletSubmission).toBe(true);
    });

    it('moves the wallet to the DAO chain before signing', async () => {
        mockQueries();
        useConnectionSpy.mockReturnValue({
            address,
            chainId: 1,
        } as unknown as wagmi.UseConnectionReturnType);

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('success'));

        expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 11_155_111 });
    });

    it('refuses a smart-contract signature the circuit cannot verify', async () => {
        mockQueries();
        signTypedDataAsync.mockResolvedValue('0x1234');

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error?.message).toMatch(/smart-contract/);
        expect(finishBallotSpy).not.toHaveBeenCalled();
    });

    it('stops before encrypting when the committee key does not match the commitment', async () => {
        mockQueries();
        verifyKeySpy.mockRejectedValue(
            new Error(
                'The committee public key does not match the on-chain commitment.',
            ),
        );

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error?.message).toMatch(/does not match/);
        expect(prepareBallotSpy).not.toHaveBeenCalled();
    });

    it('surfaces a refusal to vote found before proving', async () => {
        mockQueries();
        readContextSpy.mockRejectedValue(
            new Error('Your address holds no voting power in this round.'),
        );

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error?.message).toMatch(/no voting power/);
        expect(prepareBallotSpy).not.toHaveBeenCalled();
    });

    it('surfaces a rejection by the CRISP server', async () => {
        mockQueries();
        broadcastSpy.mockRejectedValue(new Error('not eligible'));

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error?.message).toEqual('not eligible');
    });

    it('surfaces a failed broadcast reported in the response', async () => {
        mockQueries();
        broadcastSpy.mockResolvedValue({
            status: 'failed_broadcast',
            tx_hash: null,
            job_id: null,
            encoded_proof: null,
            message: 'relay out of funds',
        });

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error?.message).toEqual('relay out of funds');
    });

    it('surfaces a rejected signature as an error', async () => {
        mockQueries();
        signTypedDataAsync.mockRejectedValue(new Error('user rejected'));

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error?.message).toEqual('user rejected');
        expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('surfaces an error instead of returning silently when the round is not ready', async () => {
        mockQueries({
            roundState: buildRoundState({ committee_public_key: [] }),
        });

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error?.message).toMatch(/not accepting ballots/);
        expect(readContextSpy).not.toHaveBeenCalled();
    });

    it('surfaces an error when no wallet is connected', async () => {
        mockQueries();
        useConnectionSpy.mockReturnValue({
            address: undefined,
        } as unknown as wagmi.UseConnectionReturnType);

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error?.message).toMatch(/Connect your wallet/);
    });

    it('counts the reviewed weight while the proof names the full voting power', async () => {
        mockQueries();

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        await waitFor(() => expect(result.current.countedShare).toBeDefined());

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('success'));

        expect(prepareBallotSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                vote: [298, 0, 0],
                votingPower: BigInt(300),
            }),
        );
        // 298 of 300 ballot units at 10 raw units each, out of 3000 raw units, rounded down.
        expect(result.current.countedShare).toEqual('99.33%');
    });

    it('counts the whole voting power when randomization is turned off', async () => {
        mockQueries();

        const { result } = renderHook(() =>
            useCrispSubmitVote({
                proposal,
                voteOption: VoteOption.YES,
                randomizeWeight: false,
            }),
        );

        await waitFor(() => expect(result.current.countedShare).toBeDefined());

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('success'));

        expect(prepareBallotSpy).toHaveBeenCalledWith(
            expect.objectContaining({ vote: [300, 0, 0] }),
        );
        expect(result.current.countedShare).toEqual('100.00%');
    });

    it('does not draw another weight when the same review is retried', async () => {
        mockQueries();
        broadcastSpy.mockRejectedValueOnce(new Error('busy'));

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        await waitFor(() => expect(result.current.countedShare).toBeDefined());

        act(() => result.current.submitVote());
        await waitFor(() => expect(result.current.state).toEqual('error'));

        act(() => result.current.submitVote());
        await waitFor(() => expect(result.current.state).toEqual('success'));

        expect(chooseWeightSpy).toHaveBeenCalledTimes(1);
        expect(prepareBallotSpy).toHaveBeenCalledTimes(2);
    });

    it('refuses a review made for a voting power that has changed', async () => {
        mockQueries();
        readContextSpy.mockResolvedValue({
            interfoldAddress: '0x3333333333333333333333333333333333333333',
            programAddress,
            inputWindow: [BigInt(0), BigInt(10)],
            committeeKeyCommitment: '0x12',
            paramSet: 1,
            votingPower: BigInt(250),
            commitmentDeadline: BigInt(10),
            encodedParams: '0x34',
        });

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        await waitFor(() => expect(result.current.countedShare).toBeDefined());

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error?.message).toMatch(/Review the ballot/);
        expect(refetchVotingPowerSpy).toHaveBeenCalled();
        expect(prepareBallotSpy).not.toHaveBeenCalled();
    });
});
