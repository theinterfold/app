import dynamic from 'next/dynamic';

export const CrispSubmitVoteDialog = dynamic(() =>
    import('./crispSubmitVoteDialog').then((mod) => mod.CrispSubmitVoteDialog),
);

export type {
    ICrispSubmitVoteDialogParams,
    ICrispSubmitVoteDialogProps,
} from './crispSubmitVoteDialog';
