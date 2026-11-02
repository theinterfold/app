import { generateProposal } from '@/modules/governance/testUtils';
import type { ICrispProposal } from '../../types';
import { generateCrispPluginSettings } from './crispPluginSettings';

export const generateCrispProposal = (
    proposal?: Partial<ICrispProposal>,
): ICrispProposal => ({
    ...generateProposal(),
    settings: generateCrispPluginSettings(),
    metrics: { votesByOption: [] },
    e3Id: '0',
    isTallyPublished: false,
    ...proposal,
});
