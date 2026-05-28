import type { JsonObject } from '@devvit/shared';

import { buildReviewerQueue } from '../core/reviewerQueue.js';
import type { ReviewerQueueItem } from '../core/reviewerQueue.js';
import type { BuildReviewerQueueOptions } from '../core/reviewerQueue.js';
import type { Signal } from '../types/signal.js';
import { getDrafts } from '../storage/commentDraftStore.js';
import type { CommentDraft } from '../types/commentDraft.js';
import {
  sanitizeDraftText,
  sanitizePostingGuidance,
} from '../core/llmCommentDraft.js';
import { getEngagements } from '../storage/engagementStore.js';
import { getInsights } from '../storage/insightStore.js';
import { listSignals } from '../storage/redisSignalStore.js';
import { loadMonitorSettings } from './monitorSettings.js';

/** Minimal queue shape embedded in custom post postData. */
export type DashboardSlimItem = {
  signal: {
    contentId: string;
    subreddit: string;
    title?: string;
    intent: { score: number };
    clusters: string[];
  };
  insight?: { painPoint: string; emotionalTone: string; urgency: string };
  commentDraft?: {
    draft: string;
    relevance: string;
    postingGuidance?: string;
  };
  draftEngagement?: {
    status: 'pending' | 'posted' | 'partial';
    matchedAuthor?: string;
    similarityScore?: number;
  };
  queueStatus: 'active' | 'redirected';
  redirectTo?: {
    title?: string;
    contentId: string;
    matchReason?: string;
    permalink?: string;
  };
  replyUrl?: string;
  similarPosts?: Array<{
    contentId: string;
    title?: string;
    permalink?: string;
    similarityScore: number;
    matchReason: string;
  }>;
};

const MAX_DASHBOARD_ITEMS = 25;
const MAX_DRAFT_CHARS = 1200;
const MAX_PAIN_CHARS = 400;

/** Devvit custom post postData hard limit (bytes). */
export const DEVVIT_POST_DATA_BYTE_LIMIT = 2000;

type SlimLimits = {
  maxItems: number;
  maxDraftChars: number;
  maxPainChars: number;
};

const POST_DATA_SLIM_ATTEMPTS: SlimLimits[] = [
  { maxItems: 8, maxDraftChars: 220, maxPainChars: 100 },
  { maxItems: 5, maxDraftChars: 160, maxPainChars: 80 },
  { maxItems: 3, maxDraftChars: 120, maxPainChars: 60 },
  { maxItems: 1, maxDraftChars: 80, maxPainChars: 40 },
];

export function queueContentIds(signals: Signal[]): string[] {
  const ids = new Set<string>();
  for (const signal of signals) {
    ids.add(signal.contentId);
    const canonical = signal.similarity?.redirectTo?.contentId;
    if (canonical) {
      ids.add(canonical);
    }
  }
  return [...ids];
}

function sanitizeStoredDraft(draft: CommentDraft): CommentDraft {
  return {
    ...draft,
    draft: sanitizeDraftText(draft.draft),
    postingGuidance: sanitizePostingGuidance(draft.postingGuidance),
  };
}

export function resolveThreadUrl(item: ReviewerQueueItem): string {
  if (item.replyUrl) {
    return item.replyUrl;
  }

  const permalink =
    item.redirectTo?.permalink ?? item.signal.permalink;
  if (permalink) {
    return permalink.startsWith('http')
      ? permalink
      : `https://www.reddit.com${permalink}`;
  }

  const contentId = item.redirectTo?.contentId ?? item.signal.contentId;
  const bareId = contentId.startsWith('t3_') ? contentId.slice(3) : contentId;
  return `https://www.reddit.com/r/${item.signal.subreddit}/comments/${bareId}/`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

export function slimDashboardItems(
  items: ReviewerQueueItem[],
  limits: SlimLimits = {
    maxItems: MAX_DASHBOARD_ITEMS,
    maxDraftChars: MAX_DRAFT_CHARS,
    maxPainChars: MAX_PAIN_CHARS,
  }
): DashboardSlimItem[] {
  return [...items]
    .sort((a, b) => b.signal.intent.score - a.signal.intent.score)
    .slice(0, limits.maxItems)
    .map((item) => ({
      signal: {
        contentId: item.signal.contentId,
        subreddit: item.signal.subreddit,
        ...(item.signal.title !== undefined ? { title: item.signal.title } : {}),
        intent: { score: item.signal.intent.score },
        clusters: item.signal.clusters,
      },
      ...(item.insight
        ? {
            insight: {
              painPoint: truncate(item.insight.painPoint, limits.maxPainChars),
              emotionalTone: item.insight.emotionalTone,
              urgency: item.insight.urgency,
            },
          }
        : {}),
      ...(item.commentDraft
        ? {
            commentDraft: {
              draft: truncate(item.commentDraft.draft, limits.maxDraftChars),
              relevance: item.commentDraft.relevance,
              ...(item.commentDraft.postingGuidance
                ? {
                    postingGuidance: truncate(
                      item.commentDraft.postingGuidance,
                      80
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(item.draftEngagement
        ? {
            draftEngagement: {
              status: item.draftEngagement.status,
              ...(item.draftEngagement.matchedAuthor !== undefined
                ? { matchedAuthor: item.draftEngagement.matchedAuthor }
                : {}),
              ...(item.draftEngagement.similarityScore !== undefined
                ? { similarityScore: item.draftEngagement.similarityScore }
                : {}),
            },
          }
        : {}),
      queueStatus: item.queueStatus,
      ...(item.redirectTo
        ? {
            redirectTo: {
              contentId: item.redirectTo.contentId,
              ...(item.redirectTo.title !== undefined
                ? { title: item.redirectTo.title }
                : {}),
              ...(item.redirectTo.matchReason !== undefined
                ? { matchReason: item.redirectTo.matchReason }
                : {}),
              ...(item.redirectTo.permalink !== undefined
                ? { permalink: item.redirectTo.permalink }
                : {}),
            },
          }
        : {}),
      ...(item.similarPosts.length > 0
        ? {
            similarPosts: item.similarPosts.slice(0, 4).map((match) => ({
              contentId: match.contentId,
              similarityScore: match.similarityScore,
              matchReason: match.matchReason,
              ...(match.title !== undefined ? { title: match.title } : {}),
              ...(match.permalink !== undefined ? { permalink: match.permalink } : {}),
            })),
          }
        : {}),
      replyUrl: resolveThreadUrl(item),
    }));
}

export async function listSignalsForQueue(
  homeSubreddit: string
): Promise<Signal[]> {
  const { monitorSubreddits } = await loadMonitorSettings();
  const subreddits = new Set([
    homeSubreddit.toLowerCase(),
    ...monitorSubreddits,
  ]);

  const batches = await Promise.all(
    [...subreddits].map((subreddit) =>
      listSignals({ subreddit, limit: 100 })
    )
  );

  const merged = new Map<string, Signal>();
  for (const batch of batches) {
    for (const signal of batch) {
      merged.set(signal.contentId, signal);
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 150);
}

export async function loadReviewerQueueForSubreddit(
  subreddit: string,
  options: BuildReviewerQueueOptions = {}
): Promise<ReviewerQueueItem[]> {
  const signals = await listSignalsForQueue(subreddit);
  const contentIds = queueContentIds(signals);
  const [draftMapRaw, insightMap, engagementMap] = await Promise.all([
    getDrafts(contentIds),
    getInsights(contentIds),
    getEngagements(contentIds),
  ]);
  const draftMap = new Map(
    [...draftMapRaw.entries()].map(([id, draft]) => [id, sanitizeStoredDraft(draft)])
  );
  return buildReviewerQueue(signals, insightMap, draftMap, engagementMap, {
    excludeRedirected: false,
    ...options,
  });
}

export function buildDashboardPostData(
  subreddit: string,
  items: ReviewerQueueItem[]
): JsonObject {
  for (const limits of POST_DATA_SLIM_ATTEMPTS) {
    const payload = JSON.parse(
      JSON.stringify({
        subreddit,
        generatedAt: new Date().toISOString(),
        items: slimDashboardItems(items, limits),
        _hint: 'Use Refresh or /api/reviewer-queue for full queue',
      })
    ) as JsonObject;

    if (dashboardPostDataByteLength(payload) <= DEVVIT_POST_DATA_BYTE_LIMIT) {
      return payload;
    }
  }

  return JSON.parse(
    JSON.stringify({
      subreddit,
      generatedAt: new Date().toISOString(),
      items: [],
      _hint: 'Queue too large for post snapshot — click Refresh for live data',
    })
  ) as JsonObject;
}

export function dashboardPostDataByteLength(data: JsonObject): number {
  return JSON.stringify(data).length;
}
