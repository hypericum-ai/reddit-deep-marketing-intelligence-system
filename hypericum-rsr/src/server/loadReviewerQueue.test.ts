import { describe, expect, it } from 'vitest';

import type { ReviewerQueueItem } from '../core/reviewerQueue.js';
import type { Signal } from '../types/signal.js';
import {
  buildDashboardPostData,
  dashboardPostDataByteLength,
  DEVVIT_POST_DATA_BYTE_LIMIT,
  slimDashboardItems,
} from './loadReviewerQueue.js';

function makeSignal(overrides: Partial<Signal> & Pick<Signal, 'contentId'>): Signal {
  return {
    contentType: 'post',
    subreddit: 'hypericum_rsr_dev',
    author: 'user',
    text: 'body',
    cleanText: 'body',
    intent: {
      score: 55,
      level: 'medium',
      intentType: 'frustration',
      matchedSignals: ['broken'],
    },
    clusters: ['devtools-pain'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    engagement: { score: 1 },
    ...overrides,
  };
}

function sampleItem(overrides: Partial<ReviewerQueueItem> = {}): ReviewerQueueItem {
  const signal = makeSignal({ contentId: 't3_test', title: 'Sample title' });
  return {
    signal: {
      contentId: signal.contentId,
      contentType: signal.contentType,
      subreddit: signal.subreddit,
      author: signal.author,
      title: signal.title,
      intent: signal.intent,
      clusters: signal.clusters,
      createdAt: signal.createdAt,
      updatedAt: signal.updatedAt,
      engagement: signal.engagement,
    },
    similarPosts: [],
    redirectRecommended: false,
    queueStatus: 'active',
    replyUrl: 'https://reddit.com/r/hypericum_rsr_dev/comments/test',
    ...overrides,
  };
}

describe('slimDashboardItems', () => {
  it('keeps only dashboard fields and caps item count', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      sampleItem({
        signal: {
          ...sampleItem().signal,
          contentId: `t3_${i}`,
          intent: {
            score: i,
            level: 'medium',
            intentType: 'frustration',
            matchedSignals: [],
          },
        },
      })
    );

    const slim = slimDashboardItems(items);
    expect(slim).toHaveLength(25);
    expect(slim[0]?.signal.contentId).toBe('t3_29');
    expect(slim[0]?.signal).not.toHaveProperty('author');
  });

  it('truncates long draft text in postData payload', () => {
    const longDraft = 'x'.repeat(2000);
    const payload = buildDashboardPostData('hypericum_rsr_dev', [
      sampleItem({
        commentDraft: {
          contentId: 't3_test',
          draft: longDraft,
          relevance: 'direct',
          relevanceReason: 'test',
          domainMatch: 'test',
          postingGuidance: 'test',
          draftedAt: Date.now(),
          model: 'gemini',
        },
      }),
    ]);

    expect(dashboardPostDataByteLength(payload)).toBeLessThanOrEqual(
      DEVVIT_POST_DATA_BYTE_LIMIT
    );
    const items = payload.items as { commentDraft?: { draft: string } }[];
    expect(items[0]?.commentDraft?.draft.length).toBeLessThan(2000);
  });

  it('fits a large queue into Devvit postData byte limit', () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      sampleItem({
        signal: {
          ...sampleItem().signal,
          contentId: `t3_${i}`,
          intent: {
            score: 50 + i,
            level: 'high',
            intentType: 'frustration',
            matchedSignals: [],
          },
        },
        commentDraft: {
          contentId: `t3_${i}`,
          draft: 'word '.repeat(120),
          relevance: 'direct',
          relevanceReason: 'test',
          domainMatch: 'test',
          postingGuidance: 'Shorten before posting',
          draftedAt: Date.now(),
          model: 'gemini',
        },
        insight: {
          contentId: `t3_${i}`,
          extractedAt: Date.now(),
          model: 'gemini',
          painPoint: 'pain '.repeat(40),
          userContext: 'ctx',
          currentWorkaround: 'none',
          desiredSolution: 'fix',
          emotionalTone: 'frustrated',
          urgency: 'high',
          marketingHook: 'hook',
          hypericumDomain: 'ai-production-failure',
        },
      })
    );

    const payload = buildDashboardPostData('hypericum_rsr_dev', items);
    expect(dashboardPostDataByteLength(payload)).toBeLessThanOrEqual(
      DEVVIT_POST_DATA_BYTE_LIMIT
    );
  });

  it('includes draft engagement in slim payload', () => {
    const slim = slimDashboardItems([
      sampleItem({
        commentDraft: {
          contentId: 't3_test',
          draft: 'hello',
          relevance: 'direct',
          relevanceReason: 'test',
          domainMatch: 'test',
          postingGuidance: 'test',
          draftedAt: Date.now(),
          model: 'gemini',
        },
        draftEngagement: {
          signalContentId: 't3_test',
          status: 'posted',
          matchedAuthor: 'reviewer',
          similarityScore: 0.85,
          lastCheckedAt: Date.now(),
        },
      }),
    ]);

    expect(slim[0]?.draftEngagement?.status).toBe('posted');
    expect(slim[0]?.draftEngagement?.matchedAuthor).toBe('reviewer');
  });

  it('always embeds a replyUrl for thread navigation', () => {
    const slim = slimDashboardItems([
      sampleItem({
        replyUrl: undefined,
        redirectTo: {
          contentId: 't3_canonical',
          title: 'Canonical thread',
          matchReason: 'duplicate',
          similarityScore: 0.9,
          matchMethod: 'heuristic',
          engagement: { score: 1 },
          hasExistingDraft: false,
        },
      }),
    ]);

    expect(slim[0]?.replyUrl).toBe(
      'https://www.reddit.com/r/hypericum_rsr_dev/comments/canonical/'
    );
  });
});
