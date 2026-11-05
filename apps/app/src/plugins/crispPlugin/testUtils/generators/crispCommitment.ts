import type { InputIdentity } from '@crisp-e3/sdk';
import {
    encodeAbiParameters,
    encodeEventTopics,
    type Hex,
    parseAbiParameters,
    type TransactionReceipt,
} from 'viem';
import { crispProgramAbi } from '../../constants/crispProgramAbi';

export const generateCrispInputIdentity = (
    identity?: Partial<InputIdentity>,
): InputIdentity => ({
    slotAddress: '0x00000000000000000000000000000000000000d4',
    encryptedVoteCommitment: `0x${'11'.repeat(32)}`,
    encryptedVoteHash: `0x${'22'.repeat(32)}`,
    parentIndexPlusOne: 3,
    ...identity,
});

/**
 * Payload as `CRISPProgram.publishInput` decodes it: the envelope of the SDK followed by the expiry
 * and the signature of the availability attestation.
 */
export const generateCrispAttestedPayload = (
    identity?: Partial<InputIdentity>,
): Hex => {
    const {
        slotAddress,
        encryptedVoteCommitment,
        encryptedVoteHash,
        parentIndexPlusOne,
    } = generateCrispInputIdentity(identity);

    return encodeAbiParameters(
        parseAbiParameters(
            'bytes, address, bytes32, bytes32, uint40, uint64, bytes',
        ),
        [
            '0x1234',
            slotAddress,
            encryptedVoteCommitment,
            encryptedVoteHash,
            parentIndexPlusOne,
            BigInt(1_800_000_000),
            '0xabcd',
        ],
    );
};

export interface IGenerateCrispCommitLogParams extends Partial<InputIdentity> {
    /**
     * Contract that emitted the event.
     */
    address?: Hex;
    e3Id?: bigint;
}

export interface ICrispCommitLog {
    address: Hex;
    topics: Hex[];
    data: Hex;
}

export const generateCrispCommitLog = (
    params?: IGenerateCrispCommitLogParams,
): ICrispCommitLog => {
    const { address, e3Id, ...identity } = params ?? {};
    const { slotAddress, encryptedVoteCommitment, encryptedVoteHash } =
        generateCrispInputIdentity(identity);

    return {
        address: address ?? '0x00000000000000000000000000000000000000b2',
        topics: encodeEventTopics({
            abi: crispProgramAbi,
            eventName: 'InputCommitted',
            args: {
                e3Id: e3Id ?? BigInt(7),
                inputId: `0x${'55'.repeat(32)}`,
                slotAddress,
            },
        }) as Hex[],
        data: encodeAbiParameters(
            parseAbiParameters('bytes32, bytes32, uint40, uint40'),
            [encryptedVoteCommitment, encryptedVoteHash, 3, 4],
        ),
    };
};

/**
 * `InputPublished` log of the publication that follows a commitment, which is the transaction the
 * server reports once the ballot is published.
 */
export const generateCrispPublishLog = (
    params?: IGenerateCrispCommitLogParams,
): ICrispCommitLog => {
    const { address, e3Id, ...identity } = params ?? {};
    const {
        slotAddress,
        encryptedVoteCommitment,
        encryptedVoteHash,
        parentIndexPlusOne,
    } = generateCrispInputIdentity(identity);

    return {
        address: address ?? '0x00000000000000000000000000000000000000b2',
        topics: encodeEventTopics({
            abi: crispProgramAbi,
            eventName: 'InputPublished',
            args: { e3Id: e3Id ?? BigInt(7), slotAddress },
        }) as Hex[],
        data: encodeAbiParameters(
            parseAbiParameters(
                'bytes32, bytes32, uint32, uint128, uint256, uint40',
            ),
            [
                encryptedVoteCommitment,
                encryptedVoteHash,
                0,
                BigInt(0),
                BigInt(4),
                parentIndexPlusOne,
            ],
        ),
    };
};

export const generateCrispCommitReceipt = (
    logs: ICrispCommitLog[],
    status: 'success' | 'reverted' = 'success',
) => ({ status, logs }) as unknown as TransactionReceipt;
