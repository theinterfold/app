export const crispProgramAbi = [
    {
        type: 'function',
        inputs: [
            { name: 'e3Id', type: 'uint256' },
            { name: 'slot', type: 'address' },
            { name: 'ciphertextCommitment', type: 'bytes32' },
        ],
        name: 'ballotDigest',
        outputs: [{ name: '', type: 'bytes32' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'censusModeOf',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'inputCommitmentDeadline',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [
            { name: 'e3Id', type: 'uint256' },
            { name: 'data', type: 'bytes' },
        ],
        name: 'publishInput',
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'snapshotOf',
        outputs: [{ name: '', type: 'uint48' }],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'InputCommitted',
        inputs: [
            { name: 'e3Id', type: 'uint256', indexed: true },
            { name: 'inputId', type: 'bytes32', indexed: true },
            { name: 'slotAddress', type: 'address', indexed: true },
            {
                name: 'encryptedVoteCommitment',
                type: 'bytes32',
                indexed: false,
            },
            { name: 'encryptedVoteHash', type: 'bytes32', indexed: false },
            { name: 'parentIndexPlusOne', type: 'uint40', indexed: false },
            { name: 'index', type: 'uint40', indexed: false },
        ],
    },
    {
        type: 'function',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'votingPowerDivisorOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        inputs: [
            { name: 'e3Id', type: 'uint256' },
            { name: 'slot', type: 'address' },
        ],
        name: 'votingPowerOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    // Custom errors of `publishInput`, listed so viem can name a revert.
    {
        type: 'error',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'E3NotAcceptingInputs',
    },
    {
        type: 'error',
        inputs: [{ name: 'inputId', type: 'bytes32' }],
        name: 'InputAlreadyCommitted',
    },
    {
        type: 'error',
        inputs: [{ name: 'expiresAt', type: 'uint64' }],
        name: 'InputAvailabilityAttestationExpired',
    },
    {
        type: 'error',
        inputs: [
            { name: 'e3Id', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ],
        name: 'InputCommitmentDeadlinePassed',
    },
    {
        type: 'error',
        inputs: [
            { name: 'e3Id', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ],
        name: 'InputDeadlinePassed',
    },
    {
        type: 'error',
        inputs: [
            { name: 'e3Id', type: 'uint256' },
            { name: 'limit', type: 'uint256' },
        ],
        name: 'InputLimitReached',
    },
    {
        type: 'error',
        inputs: [],
        name: 'InvalidInputAvailabilityAttestation',
    },
    { type: 'error', inputs: [], name: 'InvalidNoirProof' },
    {
        type: 'error',
        inputs: [{ name: 'e3Id', type: 'uint256' }],
        name: 'KeyNotPublished',
    },
    { type: 'error', inputs: [], name: 'SlotNotEligible' },
    {
        type: 'error',
        inputs: [{ name: 'parentIndex', type: 'uint40' }],
        name: 'UnknownParentInput',
    },
] as const;
