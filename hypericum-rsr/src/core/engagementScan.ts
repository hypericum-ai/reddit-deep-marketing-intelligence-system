import { reddit } from '@devvit/web/server';

import {
  isRedditPostId,
  recordDraftEngagementMatch,
  resolveEngagementPostId,
  threadIdsForDraftOwner,
} from '../core/draftEngagement.js';
import { getDrafts } from '../storage/commentDraftStore.js';
import {
  clearEngagementRecord,
  getEngagement,
  listPendingEngagementIds,
  saveEngagement,
} from '../storage/engagementStore.js';
import { getSignal, listSignals } from '../storage/redisSignalStore.js';
import { queueContentIds } from '../server/loadReviewerQueue.js';

export type EngagementScanResult = {
  checkedPosts: number;
  checkedThreads: number;
  skippedInvalid: number;
  matchesFound: number;
};

async function scanThreadComments(
  threadPostId: string,
  draftOwnerId: string
): Promise<number> {
  const comments = await reddit
    .getComments({
      postId: threadPostId as `t3_${string}`,
      sort: 'new',
      limit: 100,
    })
    .all();

  let matchesFound = 0;

  for (const comment of comments) {
    const result = await recordDraftEngagementMatch({
      postId: threadPostId,
      commentId: comment.id,
      commentAuthor: comment.authorName ?? 'unknown',
      commentBody: comment.body ?? '',
    });
    if (result?.status === 'posted' || result?.status === 'partial') {
      matchesFound += 1;
      console.log(
        `RSR engagement: ${result.status} on ${draftOwnerId}` +
        ` (thread ${threadPostId}) via ${comment.id}` +
        `  score=${((result.similarityScore ?? 0) * 100).toFixed(0)}%`
      );
      if (result.status === 'posted') {
        return matchesFound;
      }
    }
  }

  return matchesFound;
}

async function scanDraftOwner(
  draftOwnerId: string,
  signals: Awaited<ReturnType<typeof listSignals>>
): Promise<{ threads: number; matches: number }> {
  const threadIds = threadIdsForDraftOwner(draftOwnerId, signals);
  let matches = 0;

  for (const threadId of threadIds) {
    matches += await scanThreadComments(threadId, draftOwnerId);
    if (matches > 0) {
      const existing = await getEngagement(draftOwnerId);
      if (existing?.status === 'posted') {
        break;
      }
    }
  }

  if (matches === 0) {
    const existing = await getEngagement(draftOwnerId);
    if (existing) {
      await saveEngagement({
        ...existing,
        lastCheckedAt: Date.now(),
      });
    }
  }

  return { threads: threadIds.length, matches };
}

export async function scanDraftEngagementForSubreddit(
  subreddit: string,
  limit = 50
): Promise<EngagementScanResult> {
  const signals = await listSignals({ subreddit, limit: 150 });
  const draftMap = await getDrafts(queueContentIds(signals));

  const ownerIds = new Set<string>();
  for (const id of await listPendingEngagementIds(limit)) {
    const resolved = await resolveEngagementPostId(id);
    if (resolved && isRedditPostId(resolved)) {
      ownerIds.add(resolved);
    }
  }
  for (const draftId of draftMap.keys()) {
    if (isRedditPostId(draftId)) {
      ownerIds.add(draftId);
    }
  }

  let checkedPosts = 0;
  let checkedThreads = 0;
  let skippedInvalid = 0;
  let matchesFound = 0;

  for (const ownerId of ownerIds) {
    try {
      checkedPosts += 1;
      const result = await scanDraftOwner(ownerId, signals);
      checkedThreads += result.threads;
      matchesFound += result.matches;
    } catch (err) {
      skippedInvalid += 1;
      console.error(`RSR engagement: scan failed for ${ownerId}:`, err);
    }
  }

  return {
    checkedPosts,
    checkedThreads,
    skippedInvalid,
    matchesFound,
  };
}

/** @deprecated Use scanDraftEngagementForSubreddit — kept for scheduler fallback */
export async function scanPendingDraftEngagement(
  limit = 25
): Promise<EngagementScanResult> {
  const pendingIds = await listPendingEngagementIds(limit);
  let matchesFound = 0;
  let checkedPosts = 0;
  let checkedThreads = 0;
  let skippedInvalid = 0;
  const scannedOwners = new Set<string>();

  for (const contentId of pendingIds) {
    try {
      const ownerId = await resolveEngagementPostId(contentId);
      if (!ownerId || !isRedditPostId(ownerId)) {
        skippedInvalid += 1;
        await clearEngagementRecord(contentId);
        continue;
      }

      if (contentId !== ownerId) {
        await clearEngagementRecord(contentId);
      }

      if (scannedOwners.has(ownerId)) {
        continue;
      }
      scannedOwners.add(ownerId);

      const signal = await getSignal(ownerId);
      const subreddit = signal?.subreddit;
      const signals = subreddit
        ? await listSignals({ subreddit, limit: 150 })
        : [];

      checkedPosts += 1;
      const result = await scanDraftOwner(ownerId, signals);
      checkedThreads += result.threads;
      matchesFound += result.matches;
    } catch (err) {
      skippedInvalid += 1;
      console.error(`RSR engagement: scan failed for ${contentId}:`, err);
    }
  }

  return { checkedPosts, checkedThreads, skippedInvalid, matchesFound };
}
