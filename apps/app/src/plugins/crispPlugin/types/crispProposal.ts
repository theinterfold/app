import type { ITokenProposal } from '@/plugins/tokenPlugin/types';
import type { ICrispPluginSettings } from './crispPluginSettings';
import type { CrispE3FailureReason, CrispE3Stage } from './enum';

export interface ICrispProposal extends Omit<ITokenProposal, 'settings'> {
    /**
     * Plugin settings, the quorum, support threshold and minimum voter voting power are the ones
     * frozen into the proposal at creation.
     */
    settings: ICrispPluginSettings;
    /**
     * Identifier of the Interfold (E3) round tallying the ballots.
     */
    e3Id: string;
    /**
     * Defines if the decrypted tally is known, either published by the ciphernode committee or
     * stored on execution. The votes-by-option metrics are only populated once it is.
     */
    isTallyPublished: boolean;
    /**
     * Raw token units that one tally count stands for. Undefined until the backend has read it from
     * the CRISP program of the round.
     */
    votingPowerDivisor?: string;
    /**
     * Set when the Interfold round failed (or missed a deadline) and can no longer produce a
     * tally, the fee of the proposal is then refundable.
     */
    failureReason?: CrispE3FailureReason;
    /**
     * Interfold stage of a round that has not settled yet, as the backend last read it. Undefined
     * until the backend has read it.
     */
    e3Stage?: CrispE3Stage;
    /**
     * Unix seconds after which the round can be marked failed in `e3Stage`. Undefined when the
     * stage has no such deadline or the backend has not read it.
     */
    e3StageDeadline?: number;
}
