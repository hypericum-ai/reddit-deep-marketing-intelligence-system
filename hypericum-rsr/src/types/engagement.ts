export type DraftEngagementStatus = 'pending' | 'posted' | 'partial';

export type DraftEngagement = {
  signalContentId: string;
  status: DraftEngagementStatus;
  matchedCommentId?: string | undefined;
  matchedAuthor?: string | undefined;
  similarityScore?: number | undefined;
  detectedAt?: number | undefined;
  lastCheckedAt: number;
};
