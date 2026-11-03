import type { Hex } from 'viem';
import { Network } from '@/shared/api/daoService';

export interface ICrispE3Config {
    /**
     * Address of the Interfold (E3) coordinator a newly installed plugin requests its rounds from.
     * Only an installation needs it, the runtime reads it back from the plugin (`interfold()`).
     */
    interfoldAddress: Hex;
    /**
     * Address of the CRISP E3 program a newly installed plugin is bound to. Only an installation
     * needs it, the runtime resolves the program of a round from the coordinator.
     */
    crispProgramAddress: Hex;
    /**
     * Ciphernode committee size stored on the plugin at installation (`IInterfold.CommitteeSize`).
     */
    committeeSize: number;
    /**
     * BFV parameter set stored on the plugin at installation.
     */
    paramSet: number;
    /**
     * Compute-provider parameters stored on the plugin at installation and replayed into every
     * `interfold.request`. They name the prover the ciphernodes run, so they belong to the
     * Interfold deployment rather than to the DAO.
     */
    computeProviderParams: Hex;
    /**
     * Base URL of the CRISP server handling round state and encrypted ballot broadcasting.
     */
    serverUrl: string;
}

const sepoliaServerUrl =
    process.env.NEXT_PUBLIC_CRISP_SERVER_URL ||
    'https://private-crisp.theinterfold.com';

/**
 * Networks with a live Interfold deployment (coordinator, ciphernode committee and CRISP server).
 * The CRISP plugin is only functional on the networks listed here.
 */
export const crispE3Config: Partial<Record<Network, ICrispE3Config>> = {
    [Network.ETHEREUM_SEPOLIA]: {
        interfoldAddress: '0xb35EE9ed8BE5967daabBA8c2e817C52D0b57ac26',
        crispProgramAddress: '0x25Df8D3C04D67efb6198E215963d19a8d119ADFF',
        committeeSize: 0,
        paramSet: 0,
        // utf8 `{"name":"OpenVM","parallel":false,"batch_size":4}`. Empty bytes are not a safe
        // default, the quote reverts on a set the deployment does not accept.
        computeProviderParams:
            '0x7b226e616d65223a224f70656e564d222c22706172616c6c656c223a66616c73652c2262617463685f73697a65223a347d',
        serverUrl: sepoliaServerUrl,
    },
};
