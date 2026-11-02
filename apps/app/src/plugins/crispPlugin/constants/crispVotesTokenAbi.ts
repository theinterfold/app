export const crispVotesTokenAbi = [
    {
        type: 'function',
        inputs: [
            { name: 'account', type: 'address' },
            { name: 'timepoint', type: 'uint256' },
        ],
        name: 'getPastVotes',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
] as const;
