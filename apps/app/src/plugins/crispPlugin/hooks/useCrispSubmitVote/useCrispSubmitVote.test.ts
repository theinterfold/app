import { act, renderHook, waitFor } from '@testing-library/react';
import * as wagmi from 'wagmi';
import { generateTokenPluginSettingsToken } from '@/plugins/tokenPlugin/testUtils';
import { VoteOption } from '@/plugins/tokenPlugin/types';
import { Network } from '@/shared/api/daoService';
import type { ICrispRoundState } from '../../api/crispService';
import * as CrispService from '../../api/crispService';
import { crispService } from '../../api/crispService';
import {
    generateCrispAttestedPayload,
    generateCrispCommitLog,
    generateCrispCommitReceipt,
    generateCrispInputIdentity,
    generateCrispPluginSettings,
    generateCrispProposal,
} from '../../testUtils';
import {
    CrispError,
    CrispMaskTarget,
    CrispSubmitVoteMethod,
} from '../../types';
import { crispBallotUtils } from '../../utils/crispBallotUtils';
import { crispBallotWeightUtils } from '../../utils/crispBallotWeightUtils';
import { crispMaskUtils } from '../../utils/crispMaskUtils';
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
    const finishMaskSpy = jest.spyOn(crispSdkUtils, 'finishMask');
    const decodeIdentitySpy = jest.spyOn(crispSdkUtils, 'decodeInputIdentity');
    const confirmRelayedSpy = jest.spyOn(
        crispBallotUtils,
        'confirmRelayedCommitment',
    );
    const pickMaskTargetSpy = jest.spyOn(crispMaskUtils, 'pickMaskTarget');
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
    const txHash = `0x${'ab'.repeat(32)}` as const;
    const maskTarget = '0x4444444444444444444444444444444444444444';

    // Identity of the proof the voter built, for the slot of the voter and for a random target.
    const voteIdentity = generateCrispInputIdentity({ slotAddress: address });
    const targetIdentity = generateCrispInputIdentity({
        slotAddress: maskTarget,
    });
    const attestedPayload = generateCrispAttestedPayload(voteIdentity);

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
        finishMaskSpy.mockResolvedValue('0xmaskproof');
        pickMaskTargetSpy.mockResolvedValue(maskTarget);
        decodeIdentitySpy.mockResolvedValue(voteIdentity);
        confirmRelayedSpy.mockResolvedValue(undefined);
        broadcastSpy.mockResolvedValue({
            status: 'success',
            tx_hash: txHash,
            job_id: null,
            encoded_proof: null,
            message: null,
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
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
                network: Network.ETHEREUM_SEPOLIA,
                publicKey: Uint8Array.from([1, 2, 3]),
                committeeKeyCommitment: '0x12',
            }),
        );
        expect(prepareBallotSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                e3Id: BigInt(e3Id),
                slotAddress: address,
                isMaskVote: false,
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
        expect(result.current.transactionHash).toEqual(txHash);
        expect(writeContractAsync).not.toHaveBeenCalled();
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
            data: generateCrispCommitReceipt([
                generateCrispCommitLog({
                    ...voteIdentity,
                    address: programAddress,
                    e3Id: BigInt(e3Id),
                }),
            ]),
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

    it('surfaces an error when the wallet submission is mined as reverted', async () => {
        mockQueries();
        broadcastSpy.mockResolvedValue({
            status: 'ready_for_commitment',
            tx_hash: null,
            job_id: 'job-1',
            encoded_proof: attestedPayload,
            message: null,
        });
        useWaitForReceiptSpy.mockReturnValue({
            data: { status: 'reverted' },
        } as unknown as wagmi.UseWaitForTransactionReceiptReturnType);

        const { result } = renderHook(() =>
            useCrispSubmitVote({
                proposal,
                voteOption: VoteOption.YES,
                method: CrispSubmitVoteMethod.DIRECT,
            }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error).toMatchObject({
            errorKey:
                'app.plugins.crisp.crispSubmitVoteDialog.error.transactionReverted',
        });
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

        expect(result.current.error).toMatchObject({
            errorKey:
                'app.plugins.crisp.crispSubmitVoteDialog.error.smartContractSignature',
        });
        expect(finishBallotSpy).not.toHaveBeenCalled();
    });

    it('stops before encrypting when the committee key does not match the commitment', async () => {
        mockQueries();
        const mismatch = new CrispError('mismatch');
        verifyKeySpy.mockRejectedValue(mismatch);

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error).toBe(mismatch);
        expect(prepareBallotSpy).not.toHaveBeenCalled();
    });

    it('surfaces a refusal to vote found before proving', async () => {
        mockQueries();
        const refusal = new CrispError('refusal');
        readContextSpy.mockRejectedValue(refusal);

        const { result } = renderHook(() =>
            useCrispSubmitVote({ proposal, voteOption: VoteOption.YES }),
        );

        act(() => result.current.submitVote());

        await waitFor(() => expect(result.current.state).toEqual('error'));

        expect(result.current.error).toBe(refusal);
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

        expect(result.current.error).toMatchObject({
            errorKey:
                'app.plugins.crisp.crispSubmitVoteDialog.error.roundNotAccepting',
        });
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

        expect(result.current.error).toMatchObject({
            errorKey:
                'app.plugins.crisp.crispSubmitVoteDialog.error.walletNotConnected',
        });
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

        expect(result.current.error).toMatchObject({
            errorKey:
                'app.plugins.crisp.crispSubmitVoteDialog.error.reviewInvalid',
        });
        expect(refetchVotingPowerSpy).toHaveBeenCalled();
        expect(prepareBallotSpy).not.toHaveBeenCalled();
    });

    describe('masks', () => {
        const daoId = 'dao-id';

        const renderMask = (
            target: CrispMaskTarget,
            method?: CrispSubmitVoteMethod,
        ) =>
            renderHook(() =>
                useCrispSubmitVote({
                    proposal,
                    maskTarget: target,
                    daoId,
                    method,
                }),
            );

        beforeEach(() => {
            readContextSpy.mockResolvedValue({
                interfoldAddress: '0x3333333333333333333333333333333333333333',
                programAddress,
                inputWindow: [BigInt(0), BigInt(10)],
                committeeKeyCommitment: '0x12',
                paramSet: 1,
                votingPower: BigInt(40),
                commitmentDeadline: BigInt(10),
                encodedParams: '0x34',
            });
        });

        it('writes a zero ballot of the voter to the own slot with no signature', async () => {
            mockQueries();

            const { result } = renderMask(CrispMaskTarget.SELF);

            expect(result.current.isMask).toBe(true);

            act(() => result.current.submitVote());

            await waitFor(() =>
                expect(result.current.state).toEqual('success'),
            );

            expect(pickMaskTargetSpy).not.toHaveBeenCalled();
            expect(readContextSpy).toHaveBeenCalledWith(
                expect.objectContaining({ slot: address, isOwnSlot: true }),
            );
            expect(prepareBallotSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    isMaskVote: true,
                    slotAddress: address,
                    vote: [0, 0, 0],
                    votingPower: BigInt(40),
                }),
            );
            expect(readDigestSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    slot: address,
                    ciphertextCommitment: '0xcommitment',
                }),
            );
            expect(finishMaskSpy).toHaveBeenCalledWith({
                prepared: expect.anything(),
                digest: '0xdigest',
            });
            expect(signTypedDataAsync).not.toHaveBeenCalled();
            expect(finishBallotSpy).not.toHaveBeenCalled();
            // The weight of a vote is never chosen for a mask, which counts nothing.
            expect(chooseWeightSpy).not.toHaveBeenCalled();
            expect(result.current.countedShare).toBeUndefined();
            expect(broadcastSpy).toHaveBeenCalledWith({
                network: Network.ETHEREUM_SEPOLIA,
                e3Id,
                encodedProof: '0xmaskproof',
                sendFromWallet: false,
            });
            expect(result.current.transactionHash).toEqual(txHash);
        });

        it('writes the mask to a random eligible member when masking a voter', async () => {
            mockQueries();

            const { result } = renderMask(CrispMaskTarget.RANDOM);

            act(() => result.current.submitVote());

            await waitFor(() =>
                expect(result.current.state).toEqual('success'),
            );

            expect(pickMaskTargetSpy).toHaveBeenCalledWith({
                network: Network.ETHEREUM_SEPOLIA,
                daoId,
                pluginAddress: proposal.pluginAddress,
                e3Id: BigInt(e3Id),
            });
            expect(readContextSpy).toHaveBeenCalledWith(
                expect.objectContaining({ slot: maskTarget, isOwnSlot: false }),
            );
            expect(prepareBallotSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    isMaskVote: true,
                    slotAddress: maskTarget,
                    vote: [0, 0, 0],
                    votingPower: BigInt(40),
                }),
            );
            expect(readDigestSpy).toHaveBeenCalledWith(
                expect.objectContaining({ slot: maskTarget }),
            );
            expect(signTypedDataAsync).not.toHaveBeenCalled();
        });

        const handBackToWallet = (payload = attestedPayload) => {
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
                encoded_proof: payload,
                message: null,
            });
        };

        it('never sends a mask of a random member from the wallet when the relay hands it back', async () => {
            mockQueries();
            decodeIdentitySpy.mockResolvedValue(targetIdentity);
            handBackToWallet(generateCrispAttestedPayload(targetIdentity));

            const { result } = renderMask(CrispMaskTarget.RANDOM);

            act(() => result.current.submitVote());

            await waitFor(() => expect(result.current.state).toEqual('error'));

            expect(result.current.error).toMatchObject({
                errorKey:
                    'app.plugins.crisp.crispSubmitVoteDialog.error.maskNotRelayed',
            });
            expect(writeContractAsync).not.toHaveBeenCalled();
            expect(switchChainAsync).not.toHaveBeenCalled();
            expect(result.current.isWalletSubmission).toBe(false);
        });

        it('relays a mask of a random member even when sending it from the wallet is asked', async () => {
            mockQueries();
            decodeIdentitySpy.mockResolvedValue(targetIdentity);

            const { result } = renderMask(
                CrispMaskTarget.RANDOM,
                CrispSubmitVoteMethod.DIRECT,
            );

            expect(result.current.isWalletSubmission).toBe(false);

            act(() => result.current.submitVote());

            await waitFor(() =>
                expect(result.current.state).toEqual('success'),
            );

            expect(broadcastSpy).toHaveBeenCalledWith(
                expect.objectContaining({ sendFromWallet: false }),
            );
            expect(result.current.isWalletSubmission).toBe(false);
            expect(confirmRelayedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    expectation: expect.objectContaining({
                        identity: targetIdentity,
                    }),
                }),
            );
        });

        it('does not report a mask as an update of the vote of the voter', async () => {
            mockQueries();
            useVoteStatusSpy.mockReturnValue({
                data: { slot_active: true },
                isLoading: false,
            } as unknown as ReturnType<typeof CrispService.useCrispVoteStatus>);

            const { result } = renderMask(CrispMaskTarget.SELF);

            act(() => result.current.submitVote());

            await waitFor(() =>
                expect(result.current.state).toEqual('success'),
            );

            expect(result.current.isVoteUpdate).toBe(false);
        });

        it('stops before encrypting when no member can be masked', async () => {
            mockQueries();
            const refusal = new CrispError('refusal');
            pickMaskTargetSpy.mockRejectedValue(refusal);

            const { result } = renderMask(CrispMaskTarget.RANDOM);

            act(() => result.current.submitVote());

            await waitFor(() => expect(result.current.state).toEqual('error'));

            expect(result.current.error).toBe(refusal);
            expect(readContextSpy).not.toHaveBeenCalled();
            expect(prepareBallotSpy).not.toHaveBeenCalled();
        });
    });

    describe('commitment checks', () => {
        const handBackToWallet = (payload = attestedPayload) =>
            broadcastSpy.mockResolvedValue({
                status: 'ready_for_commitment',
                tx_hash: null,
                job_id: 'job-1',
                encoded_proof: payload,
                message: null,
            });

        const submit = (method?: CrispSubmitVoteMethod) => {
            const rendered = renderHook(() =>
                useCrispSubmitVote({
                    proposal,
                    voteOption: VoteOption.YES,
                    method,
                }),
            );

            act(() => rendered.result.current.submitVote());

            return rendered;
        };

        it('reports success of a relayed ballot only after the chain shows its commitment', async () => {
            mockQueries();

            const { result } = submit();

            await waitFor(() =>
                expect(result.current.state).toEqual('success'),
            );

            expect(confirmRelayedSpy).toHaveBeenCalledWith({
                network: Network.ETHEREUM_SEPOLIA,
                transactionHash: txHash,
                expectation: {
                    programAddress,
                    e3Id: BigInt(e3Id),
                    identity: voteIdentity,
                },
            });
        });

        it('does not report success of a relayed ballot the chain does not confirm', async () => {
            mockQueries();
            const refusal = new CrispError('not committed');
            confirmRelayedSpy.mockRejectedValue(refusal);

            const { result } = submit();

            await waitFor(() => expect(result.current.state).toEqual('error'));

            expect(result.current.error).toBe(refusal);
        });

        it('does not report success when the server gives no transaction to confirm with', async () => {
            mockQueries();
            broadcastSpy.mockResolvedValue({
                status: 'success',
                tx_hash: null,
                job_id: null,
                encoded_proof: null,
                message: null,
            });

            const { result } = submit();

            await waitFor(() => expect(result.current.state).toEqual('error'));

            expect(result.current.error).toMatchObject({
                errorKey:
                    'app.plugins.crisp.crispSubmitVoteDialog.error.commitmentUnconfirmed',
            });
            expect(confirmRelayedSpy).not.toHaveBeenCalled();
        });

        it('refuses a transaction hash that is not a hash and never links to it', async () => {
            mockQueries();
            broadcastSpy.mockResolvedValue({
                status: 'success',
                tx_hash: 'javascript:alert(1)',
                job_id: null,
                encoded_proof: null,
                message: null,
            });

            const { result } = submit();

            await waitFor(() => expect(result.current.state).toEqual('error'));

            expect(result.current.error).toMatchObject({
                errorKey:
                    'app.plugins.crisp.crispSubmitVoteDialog.error.transactionHashInvalid',
            });
            expect(result.current.transactionHash).toBeUndefined();
            expect(confirmRelayedSpy).not.toHaveBeenCalled();
        });

        it('sends nothing when the attested payload names another ballot', async () => {
            mockQueries();
            handBackToWallet(
                generateCrispAttestedPayload({
                    ...voteIdentity,
                    slotAddress: '0x5555555555555555555555555555555555555555',
                }),
            );

            const { result } = submit(CrispSubmitVoteMethod.DIRECT);

            await waitFor(() => expect(result.current.state).toEqual('error'));

            expect(result.current.error).toMatchObject({
                errorKey:
                    'app.plugins.crisp.crispSubmitVoteDialog.error.attestedPayloadMismatch',
            });
            expect(writeContractAsync).not.toHaveBeenCalled();
            expect(switchChainAsync).not.toHaveBeenCalled();
        });

        it('does not report success of a wallet submission whose receipt holds no commitment of the ballot', async () => {
            mockQueries();
            handBackToWallet();
            useWaitForReceiptSpy.mockReturnValue({
                data: generateCrispCommitReceipt([
                    generateCrispCommitLog({
                        ...voteIdentity,
                        address: programAddress,
                        e3Id: BigInt(e3Id) + BigInt(1),
                    }),
                ]),
            } as unknown as wagmi.UseWaitForTransactionReceiptReturnType);

            const { result } = submit(CrispSubmitVoteMethod.DIRECT);

            await waitFor(() => expect(result.current.state).toEqual('error'));

            expect(result.current.error).toMatchObject({
                errorKey:
                    'app.plugins.crisp.crispSubmitVoteDialog.error.commitmentNotFound',
            });
        });
    });
});
