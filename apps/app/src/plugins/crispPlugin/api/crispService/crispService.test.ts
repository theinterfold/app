import { Network } from '@/shared/api/daoService';
import { crispE3Config } from '../../constants/crispE3Config';
import { crispService } from './crispService';

describe('crisp service', () => {
    const requestSpy = jest.spyOn(crispService, 'request');

    const network = Network.ETHEREUM_SEPOLIA;
    const serverUrl = crispE3Config[network]!.serverUrl;

    // Round ids are ~1e76 on-chain, so they travel as decimal strings: a JS number would round
    // them to a different round.
    const e3Id =
        '41376546203487432478123123123123123123123123123123123123123123123123123123123';

    afterEach(() => {
        requestSpy.mockReset();
    });

    it('getRoundState posts the round id as a string to the CRISP server of the network', async () => {
        const roundState = { status: 'Active', committee_public_key: [1] };
        requestSpy.mockResolvedValue(roundState);

        const result = await crispService.getRoundState({ network, e3Id });

        expect(requestSpy).toHaveBeenCalledWith(
            `${serverUrl}/state/lite`,
            { body: { round_id: e3Id } },
            { method: 'POST' },
        );
        expect(result).toEqual(roundState);
    });

    it('getVoteStatus sends the address alongside the round id', async () => {
        const status = { slot_active: true };
        requestSpy.mockResolvedValue(status);

        const result = await crispService.getVoteStatus({
            network,
            e3Id,
            address: '0x123',
        });

        expect(requestSpy).toHaveBeenCalledWith(
            `${serverUrl}/voting/status`,
            { body: { round_id: e3Id, address: '0x123' } },
            { method: 'POST' },
        );
        expect(result).toEqual(status);
    });

    it('broadcastBallot stages the proof and says who sends the commitment, without an address', async () => {
        // The server derives the slot from the proof, so the request carries no address.
        const response = { status: 'pending_commitment', job_id: 'job-1' };
        requestSpy.mockResolvedValue(response);

        const result = await crispService.broadcastBallot({
            network,
            e3Id,
            encodedProof: '0xproof',
            sendFromWallet: true,
        });

        expect(requestSpy).toHaveBeenCalledWith(
            `${serverUrl}/voting/broadcast`,
            {
                body: {
                    round_id: e3Id,
                    encoded_proof: '0xproof',
                    send_from_wallet: true,
                },
            },
            { method: 'POST' },
        );
        expect(result).toEqual(response);
    });

    it('getVoteAvailability reads the job of a staged ballot', async () => {
        const job = { status: 'ready_for_commitment', job_id: 'job/1' };
        requestSpy.mockResolvedValue(job);

        const result = await crispService.getVoteAvailability({
            network,
            jobId: 'job/1',
        });

        expect(requestSpy).toHaveBeenCalledWith(
            `${serverUrl}/voting/availability/:jobId`,
            { urlParams: { jobId: 'job/1' } },
        );
        expect(result).toEqual(job);
    });

    it('throws on a network with no CRISP server instead of requesting an invalid url', async () => {
        await expect(
            crispService.getRoundState({
                network: Network.POLYGON_MAINNET,
                e3Id,
            }),
        ).rejects.toThrow(/no CRISP server configured/);

        expect(requestSpy).not.toHaveBeenCalled();
    });
});
