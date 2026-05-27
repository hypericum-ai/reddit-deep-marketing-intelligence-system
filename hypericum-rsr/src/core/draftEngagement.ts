import { reddit } from '@devvit/web/server';

import { jaccardSimilarity } from './similarity.js';
import { getDraft } from '../storage/commentDraftStore.js';
import {
  clearEngagementRecord,
  getEngagement,
  saveEngagement,
} from '../storage/engagementStore.js';
import { getSignal } from '../storage/redisSignalStore.js';
import type { DraftEngagement } from '../types/engagement.js';
import type { Signal } from '../types/signal.js';

export const DRAFT_MATCH_THRESHOLD = 0.28;
export const DRAFT_PARTIAL_THRESHOLD = 0.15;

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

export function scoreDraftSimilarity(draftText: string, commentText: string): number {
  return jaccardSimilarity(tokenSet(draftText), tokenSet(commentText));
}

export function isRedditPostId(id: string): boolean {
  return id.startsWith('t3_');
}

export function postIdFromCommentPermalink(permalink?: string): string | undefined {
  if (!permalink) {
    return undefined;
  }
  const match = permalink.match(/\/comments\/([^/]+)/i);
  if (!match?.[1]) {
    return undefined;
  }
  const segment = match[1];
  return segment.startsWith('t3_') ? segment : `t3_${segment}`;
}

export async function resolveDraftTargetPostId(postId: string): Promise<string> {
  const signal = await getSignal(postId);
  const redirectId = signal?.similarity?.redirectTo?.contentId;
  if (redirectId && isRedditPostId(redirectId)) {
    return redirectId;
  }
  return postId;
}

/** Map a signal or pending id to the t3_ post whose thread comments should be scanned. */
export async function resolveEngagementPostId(
  contentId: string
): Promise<string | undefined> {
  if (isRedditPostId(contentId)) {
    return resolveDraftTargetPostId(contentId);
  }

  if (!contentId.startsWith('t1_')) {
    return undefined;
  }

  const signal = await getSignal(contentId);
  const fromPermalink = postIdFromCommentPermalink(signal?.permalink);
  if (fromPermalink && isRedditPostId(fromPermalink)) {
    return resolveDraftTargetPostId(fromPermalink);
  }

  try {
    const comment = await reddit.getCommentById(contentId as `t1_${string}`);
    if (comment.postId && isRedditPostId(comment.postId)) {
      return resolveDraftTargetPostId(comment.postId);
    }
  } catch (err) {
    console.error(`RSR engagement: could not resolve post for ${contentId}:`, err);
  }

  return undefined;
}

export async function initDraftEngagement(signalContentId: string): Promise<void> {
  const postId = await resolveEngagementPostId(signalContentId);
  if (!postId) {
    console.log(`RSR engagement: skip init for ${signalContentId} (no post id)`);
    return;
  }

  if (signalContentId !== postId) {
    await clearEngagementRecord(signalContentId);
  }

  const existing = await getEngagement(postId);
  if (existing) {
    return;
  }

  await saveEngagement({
    signalContentId: postId,
    status: 'pending',
    lastCheckedAt: Date.now(),
  });
}

export function threadIdsForDraftOwner(
  draftPostId: string,
  signals: Signal[]
): string[] {
  const ids = new Set<string>();
  if (isRedditPostId(draftPostId)) {
    ids.add(draftPostId);
  }
  for (const signal of signals) {
    if (isRedditPostId(signal.contentId)) {
      if (signal.contentId === draftPostId) {
        ids.add(signal.contentId);
      }
      if (signal.similarity?.redirectTo?.contentId === draftPostId) {
        ids.add(signal.contentId);
      }
    }
  }
  return [...ids];
}

export async function findDraftForThread(postId: string): Promise<
  | { draftPostId: string; draft: Awaited<ReturnType<typeof getDraft>> }
  | undefined
> {
  const targetPostId = await resolveEngagementPostId(postId);
  if (!targetPostId) {
    return undefined;
  }
  const draft =
    (await getDraft(targetPostId)) ?? (await getDraft(postId));
  if (!draft) {
    return undefined;
  }
  return { draftPostId: targetPostId, draft };
}

export async function recordDraftEngagementMatch(input: {
  postId: string;
  commentId: string;
  commentAuthor: string;
  commentBody: string;
}): Promise<DraftEngagement | undefined> {
  const located = await findDraftForThread(input.postId);
  if (!located?.draft) {
    return undefined;
  }
  const targetPostId = located.draftPostId;

  const score = scoreDraftSimilarity(located.draft.draft, input.commentBody);
  if (score < DRAFT_PARTIAL_THRESHOLD) {
    return undefined;
  }

  const status = score >= DRAFT_MATCH_THRESHOLD ? 'posted' : 'partial';
  const engagement: DraftEngagement = {
    signalContentId: targetPostId,
    status,
    matchedCommentId: input.commentId,
    matchedAuthor: input.commentAuthor,
    similarityScore: score,
    detectedAt: Date.now(),
    lastCheckedAt: Date.now(),
  };

  const existing = await getEngagement(targetPostId);
  if (
    existing?.status === 'posted' &&
    (existing.similarityScore ?? 0) >= (engagement.similarityScore ?? 0)
  ) {
    return existing;
  }

  await saveEngagement(engagement);
  return engagement;
}
