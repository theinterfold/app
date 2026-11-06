// Interfold coordinator reads (E3 record, BFV parameter sets, round lifecycle) and the
// permissionless calls that settle a failed round.
export const crispInterfoldAbi = [
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'getE3',
        // The plugin reads `e3Program`, `inputWindow`, `committeePublicKey` and `paramSet`, but the
        // whole struct has to be declared for the response to decode.
        outputs: [
            {
                name: 'e3',
                type: 'tuple',
                components: [
                    { name: 'seed', type: 'uint256' },
                    { name: 'committeeSize', type: 'uint8' },
                    { name: 'requestBlock', type: 'uint256' },
                    { name: 'inputWindow', type: 'uint256[2]' },
                    { name: 'encryptionSchemeId', type: 'bytes32' },
                    { name: 'e3Program', type: 'address' },
                    { name: 'paramSet', type: 'uint8' },
                    { name: 'customParams', type: 'bytes' },
                    { name: 'decryptionVerifier', type: 'address' },
                    { name: 'pkVerifier', type: 'address' },
                    { name: 'committeePublicKey', type: 'bytes32' },
                    { name: 'ciphertextOutput', type: 'bytes32' },
                    { name: 'plaintextOutput', type: 'bytes' },
                    { name: 'requester', type: 'address' },
                    { name: 'ciphertextCommitment', type: 'bytes32' },
                ],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [{ name: '', type: 'uint8' }],
        name: 'paramSetRegistry',
        outputs: [{ name: '', type: 'bytes' }],
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
        inputs: [],
        name: 'markFailedGracePeriod',
        outputs: [{ name: '', type: 'uint256' }],
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
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'getE3PolicySnapshot',
        outputs: [
            {
                name: 'snapshot',
                type: 'tuple',
                components: [
                    {
                        name: 'allocation',
                        type: 'tuple',
                        components: [
                            { name: 'committeeFormationBps', type: 'uint16' },
                            { name: 'dkgBps', type: 'uint16' },
                            { name: 'decryptionBps', type: 'uint16' },
                            { name: 'protocolBps', type: 'uint16' },
                            { name: 'successSlashedNodeBps', type: 'uint16' },
                        ],
                    },
                    { name: 'treasury', type: 'address' },
                    { name: 'interfold', type: 'address' },
                    { name: 'registry', type: 'address' },
                    { name: 'version', type: 'uint64' },
                    { name: 'initialized', type: 'bool' },
                    { name: 'bondingRegistry', type: 'address' },
                    { name: 'slashingManager', type: 'address' },
                ],
            },
        ],
        stateMutability: 'view',
    },
] as const;

// Settlement gate of a failed round on the slashing manager the round was requested under.
export const crispSlashingManagerAbi = [
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'settlementOpen',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'accusationSubmissionDeadline',
        outputs: [{ name: 'submissionDeadline', type: 'uint64' }],
        stateMutability: 'view',
    },
] as const;
