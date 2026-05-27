import type { CommentDraft } from '../types/commentDraft.js';
import type { DraftEngagement } from '../types/engagement.js';
import type { LLMInsight } from '../types/insight.js';
import type { Signal } from '../types/signal.js';
import type { SimilarMatch } from '../types/similarity.js';

export type ReviewerQueueItem = {
  signal: Omit<Signal, 'text' | 'cleanText'>;
  insight?: LLMInsight | undefined;
  commentDraft?: CommentDraft | undefined;
  draftEngagement?: DraftEngagement | undefined;
  similarPosts: SimilarMatch[];
  redirectTo?: SimilarMatch | undefined;
  redirectRecommended: boolean;
  queueStatus: 'active' | 'redirected';
  replyUrl?: string | undefined;
};

export type BuildReviewerQueueOptions = {
  relevanceFilter?: string | undefined;
  excludeRedirected?: boolean | undefined;
};

function redditUrl(permalink?: string): string | undefined {
  if (!permalink) {
    return undefined;
  }
  return `https://reddit.com${permalink}`;
}

function lookupDraft(
  signal: Signal,
  draftMap: Map<string, CommentDraft>
): CommentDraft | undefined {
  const own = draftMap.get(signal.contentId);
  if (own) {
    return own;
  }
  const canonicalId = signal.similarity?.redirectTo?.contentId;
  if (canonicalId) {
    return draftMap.get(canonicalId);
  }
  return undefined;
}

function lookupEngagement(
  signal: Signal,
  engagementMap: Map<string, DraftEngagement>
): DraftEngagement | undefined {
  const own = engagementMap.get(signal.contentId);
  if (own) {
    return own;
  }
  const canonicalId = signal.similarity?.redirectTo?.contentId;
  if (canonicalId) {
    return engagementMap.get(canonicalId);
  }
  return undefined;
}

export function buildReviewerQueue(
  signals: Signal[],
  insightMap: Map<string, LLMInsight>,
  draftMap: Map<string, CommentDraft>,
  engagementMap: Map<string, DraftEngagement> = new Map(),
  options: BuildReviewerQueueOptions = {}
): ReviewerQueueItem[] {
  const { relevanceFilter, excludeRedirected = false } = options;

  return signals
    .map((signal) => {
      const similarity = signal.similarity;
      const queueStatus =
        signal.status === 'redirected' || similarity?.redirectRecommended
          ? 'redirected'
          : 'active';

      const item: ReviewerQueueItem = {
        signal: {
          contentId: signal.contentId,
          contentType: signal.contentType,
          subreddit: signal.subreddit,
          author: signal.author,
          intent: signal.intent,
          clusters: signal.clusters,
          createdAt: signal.createdAt,
          updatedAt: signal.updatedAt,
          engagement: signal.engagement,
          ...(signal.title !== undefined ? { title: signal.title } : {}),
          ...(signal.permalink !== undefined
            ? { permalink: signal.permalink }
            : {}),
          ...(signal.status !== undefined ? { status: signal.status } : {}),
          ...(similarity !== undefined ? { similarity } : {}),
        },
        insight: insightMap.get(signal.contentId),
        commentDraft: lookupDraft(signal, draftMap),
        draftEngagement: lookupEngagement(signal, engagementMap),
        similarPosts: similarity?.similarPosts ?? [],
        redirectRecommended: similarity?.redirectRecommended ?? false,
        queueStatus,
        ...(similarity?.redirectTo !== undefined
          ? { redirectTo: similarity.redirectTo }
          : {}),
        replyUrl: redditUrl(
          similarity?.redirectTo?.permalink ?? signal.permalink
        ),
      };

      return item;
    })
    .filter((item) =>
      relevanceFilter
        ? item.commentDraft?.relevance === relevanceFilter
        : true
    )
    .filter((item) => (excludeRedirected ? item.queueStatus === 'active' : true))
    .filter((item) => item.signal.intent.score >= 30);
}
