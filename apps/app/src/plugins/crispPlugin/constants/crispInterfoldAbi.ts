// IInterfold.E3Stage.Failed
export const crispE3StageFailed = 6;

// Interfold coordinator reads (E3 record, BFV parameter sets, round lifecycle) and the
// permissionless calls that settle a failed round.
export const crispInterfoldAbi = [
    {
        type: 'function',
        inputs: [{ name: 'e3Id', internalType: 'uint256', type: 'uint256' }],
        name: 'getE3',
        outputs: [
            {
                name: 'e3',
                internalType: 'struct E3',
                type: 'tuple',
                components: [
                    { name: 'seed', internalType: 'uint256', type: 'uint256' },
                    {
                        name: 'committeeSize',
                        internalType: 'enum IInterfold.CommitteeSize',
                        type: 'uint8',
                    },
                    {
                        name: 'requestBlock',
                        internalType: 'uint256',
                        type: 'uint256',
                    },
                    {
                        name: 'inputWindow',
                        internalType: 'uint256[2]',
                        type: 'uint256[2]',
                    },
                    {
                        name: 'encryptionSchemeId',
                        internalType: 'bytes32',
                        type: 'bytes32',
                    },
                    {
                        name: 'e3Program',
                        internalType: 'contract IE3Program',
                        type: 'address',
                    },
                    { name: 'paramSet', internalType: 'uint8', type: 'uint8' },
                    {
                        name: 'customParams',
                        internalType: 'bytes',
                        type: 'bytes',
                    },
                    {
                        name: 'decryptionVerifier',
                        internalType: 'contract IDecryptionVerifier',
                        type: 'address',
                    },
                    {
                        name: 'pkVerifier',
                        internalType: 'contract IPkVerifier',
                        type: 'address',
                    },
                    {
                        name: 'committeePublicKey',
                        internalType: 'bytes32',
                        type: 'bytes32',
                    },
                    {
                        name: 'ciphertextOutput',
                        internalType: 'bytes32',
                        type: 'bytes32',
                    },
                    {
                        name: 'plaintextOutput',
                        internalType: 'bytes',
                        type: 'bytes',
                    },
                    {
                        name: 'requester',
                        internalType: 'address',
                        type: 'address',
                    },
                    {
                        name: 'ciphertextCommitment',
                        internalType: 'bytes32',
                        type: 'bytes32',
                    },
                ],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
        name: 'paramSetRegistry',
        outputs: [{ name: '', internalType: 'bytes', type: 'bytes' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'getE3Stage',
        outputs: [{ name: 'stage', type: 'uint8' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'getFailureReason',
        outputs: [{ name: 'reason', type: 'uint8' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'checkFailureCondition',
        outputs: [
            { name: 'canFail', type: 'bool' },
            { name: 'reason', type: 'uint8' },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [],
        name: 'e3RefundManager',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'markE3Failed',
        outputs: [{ name: 'reason', type: 'uint8' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'processE3Failure',
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

// Refund bookkeeping of a failed round on the coordinator's E3RefundManager.
export const crispRefundManagerAbi = [
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'getRefundDistribution',
        outputs: [
            {
                name: '',
                type: 'tuple',
                components: [
                    { name: 'requesterAmount', type: 'uint256' },
                    { name: 'honestNodeAmount', type: 'uint256' },
                    { name: 'protocolAmount', type: 'uint256' },
                    { name: 'totalSlashed', type: 'uint256' },
                    { name: 'honestNodeCount', type: 'uint256' },
                    { name: 'calculated', type: 'bool' },
                    { name: 'feeToken', type: 'address' },
                    { name: 'originalPayment', type: 'uint256' },
                    { name: 'perNodeAmount', type: 'uint256' },
                ],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [
            { name: 'e3Id', type: 'uint256' },
            { name: 'claimant', type: 'address' },
        ],
        name: 'hasRequesterClaimed',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
    },
] as const;
