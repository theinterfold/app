import type { Network } from '@/shared/api/daoService';
import { HttpService } from '@/shared/api/httpService';
import { crispE3Config } from '../../constants/crispE3Config';
import type {
    ICrispBroadcastBallotParams,
    ICrispRoundParams,
    ICrispVoteAvailabilityParams,
    ICrispVoteStatusParams,
} from './crispService.api';
import { CrispServiceError } from './crispServiceError';
import type {
    ICrispRoundState,
    ICrispVoteResponse,
    ICrispVoteStatus,
} from './domain';

/**
 * Client of the CRISP server, which stages and relays encrypted ballots and serves the state of an
 * E3 round. The server is resolved per network, so requests are issued against an absolute URL
 * instead of a fixed base URL.
 */
class CrispService extends HttpService {
    private urls = {
        roundState: '/state/lite',
        voteStatus: '/voting/status',
        broadcast: '/voting/broadcast',
        availability: '/voting/availability/:jobId',
    };

    constructor() {
        super('', CrispServiceError.fromResponse);
    }

    getRoundState = async (
        params: ICrispRoundParams,
    ): Promise<ICrispRoundState> =>
        this.post<ICrispRoundState>(params.network, this.urls.roundState, {
            round_id: params.e3Id,
        });

    getVoteStatus = async (
        params: ICrispVoteStatusParams,
    ): Promise<ICrispVoteStatus> =>
        this.post<ICrispVoteStatus>(params.network, this.urls.voteStatus, {
            round_id: params.e3Id,
            address: params.address,
        });

    /**
     * Stages an encrypted ballot: the server stores the ciphertext, signs the availability
     * attestation `publishInput` requires and either relays the commitment or hands the attested
     * payload back. The answer is a staged job, follow it with `getVoteAvailability`.
     */
    broadcastBallot = async (
        params: ICrispBroadcastBallotParams,
    ): Promise<ICrispVoteResponse> =>
        this.post<ICrispVoteResponse>(params.network, this.urls.broadcast, {
            round_id: params.e3Id,
            encoded_proof: params.encodedProof,
            send_from_wallet: params.sendFromWallet,
        });

    getVoteAvailability = async (
        params: ICrispVoteAvailabilityParams,
    ): Promise<ICrispVoteResponse> =>
        this.request<ICrispVoteResponse>(
            this.buildServerUrl(params.network, this.urls.availability),
            { urlParams: { jobId: params.jobId } },
        );

    private post = <TData>(
        network: Network,
        url: string,
        body: Record<string, unknown>,
    ): Promise<TData> =>
        this.request<TData>(
            this.buildServerUrl(network, url),
            { body },
            { method: 'POST' },
        );

    /**
     * Base URL of the CRISP server of the network.
     * @throws When the environment configures none for the network.
     */
    getServerUrl = (network: Network): string => {
        const serverUrl = crispE3Config[network]?.serverUrl;

        if (serverUrl == null) {
            throw new Error(
                `CrispService: no CRISP server configured for network ${network}`,
            );
        }

        return serverUrl;
    };

    private buildServerUrl = (network: Network, url: string): string =>
        `${this.getServerUrl(network)}${url}`;
}

export const crispService = new CrispService();
