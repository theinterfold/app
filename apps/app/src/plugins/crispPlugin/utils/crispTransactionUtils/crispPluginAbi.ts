// abi.decode(_installationParams, (PluginInitParams, address token, bool grantExecuteOnDao))
export const crispPluginSetupAbi = [
    {
        name: 'pluginInitParams',
        type: 'tuple',
        components: [
            // Overwritten by the setup contract, any value can be set here
            { name: 'dao', type: 'address' },
            { name: 'token', type: 'address' },
            { name: 'interfold', type: 'address' },
            { name: 'committeeSize', type: 'uint8' },
            { name: 'paramSet', type: 'uint8' },
            { name: 'crispProgramAddress', type: 'address' },
            { name: 'computeProviderParams', type: 'bytes' },
            {
                name: 'votingSettings',
                type: 'tuple',
                components: [
                    { name: 'minProposerVotingPower', type: 'uint256' },
                    { name: 'minVoterVotingPower', type: 'uint256' },
                    { name: 'minParticipation', type: 'uint32' },
                    { name: 'supportThreshold', type: 'uint32' },
                    { name: 'minDuration', type: 'uint64' },
                ],
            },
        ],
    },
    { name: 'token', type: 'address' },
    { name: 'grantExecuteOnDao', type: 'bool' },
] as const;

export const crispProposalParamsAbi = [
    { name: 'allowFailureMap', type: 'uint256' },
] as const;

export const crispPluginAbi = [
    {
        type: 'function',
        name: 'claimRefund',
        inputs: [{ name: '_proposalId', type: 'uint256' }],
        outputs: [{ name: 'amount', type: 'uint256' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'createProposal',
        inputs: [
            { name: '_metadata', type: 'bytes' },
            {
                name: '_actions',
                type: 'tuple[]',
                components: [
                    { name: 'to', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'data', type: 'bytes' },
                ],
            },
            { name: '_startDate', type: 'uint64' },
            { name: '_endDate', type: 'uint64' },
            { name: '_data', type: 'bytes' },
        ],
        outputs: [{ name: 'proposalId', type: 'uint256' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'deposit',
        inputs: [{ name: '_amount', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'feeCredits',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getProposal',
        inputs: [{ name: '_proposalId', type: 'uint256' }],
        outputs: [
            {
                name: 'proposal_',
                type: 'tuple',
                components: [
                    { name: 'executed', type: 'bool' },
                    {
                        name: 'parameters',
                        type: 'tuple',
                        components: [
                            { name: 'numOptions', type: 'uint256' },
                            { name: 'startDate', type: 'uint64' },
                            { name: 'endDate', type: 'uint64' },
                            { name: 'snapshotBlock', type: 'uint256' },
                            { name: 'minVotingPower', type: 'uint256' },
                            { name: 'minParticipation', type: 'uint256' },
                            { name: 'supportThreshold', type: 'uint256' },
                            { name: 'creditMode', type: 'uint8' },
                        ],
                    },
                    {
                        name: 'tally',
                        type: 'tuple',
                        components: [{ name: 'counts', type: 'uint256[]' }],
                    },
                    {
                        name: 'actions',
                        type: 'tuple[]',
                        components: [
                            { name: 'to', type: 'address' },
                            { name: 'value', type: 'uint256' },
                            { name: 'data', type: 'bytes' },
                        ],
                    },
                    { name: 'allowFailureMap', type: 'uint256' },
                    {
                        name: 'targetConfig',
                        type: 'tuple',
                        components: [
                            { name: 'target', type: 'address' },
                            { name: 'operation', type: 'uint8' },
                        ],
                    },
                    { name: 'e3Id', type: 'uint256' },
                ],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getTally',
        inputs: [{ name: '_proposalId', type: 'uint256' }],
        outputs: [
            {
                name: '',
                type: 'tuple',
                components: [{ name: 'counts', type: 'uint256[]' }],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'interfold',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'interfoldFeeToken',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'proposalPayer',
        inputs: [{ name: '', type: 'uint256' }],
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'quoteProposalFee',
        inputs: [
            { name: '_startDate', type: 'uint64' },
            { name: '_endDate', type: 'uint64' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'quoteProposalFeeForDuration',
        inputs: [{ name: '_votingDuration', type: 'uint64' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'totalVotingPower',
        inputs: [{ name: '_blockNumber', type: 'uint256' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'updateVotingSettings',
        inputs: [
            {
                name: '_votingSettings',
                type: 'tuple',
                components: [
                    { name: 'minProposerVotingPower', type: 'uint256' },
                    { name: 'minVoterVotingPower', type: 'uint256' },
                    { name: 'minParticipation', type: 'uint32' },
                    { name: 'supportThreshold', type: 'uint32' },
                    { name: 'minDuration', type: 'uint64' },
                ],
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'withdraw',
        inputs: [{ name: '_amount', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;
