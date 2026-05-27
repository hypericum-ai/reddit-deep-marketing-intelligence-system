import { describe, expect, it } from 'vitest';

import type { Signal } from '../types/signal.js';
import { buildReviewerQueue } from './reviewerQueue.js';

function makeSignal(overrides: Partial<Signal> & Pick<Signal, 'contentId'>): Signal {
  return {
    contentType: 'post',
    subreddit: 'test',
    author: 'user',
    text: 'body',
    cleanText: 'body',
    intent: {
      score: 80,
      level: 'high',
      intentType: 'frustration',
      matchedSignals: ['broken'],
    },
    clusters: ['ai-production-failure'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    engagement: { score: 1 },
    ...overrides,
  };
}

describe('buildReviewerQueue', () => {
  it('marks redirected items and exposes replyUrl to canonical thread', () => {
    const redirected = makeSignal({
      contentId: 't3_new',
      title: 'duplicate post',
      status: 'redirected',
      similarity: {
        status: 'redirected',
        redirectRecommended: true,
        similarPosts: [],
        redirectTo: {
          contentId: 't3_old',
          permalink: '/r/test/comments/old',
          title: 'original post',
          similarityScore: 0.92,
          matchReason: 'same title',
          matchMethod: 'heuristic',
          engagement: { score: 5 },
          hasExistingDraft: true,
        },
      },
    });

    const queue = buildReviewerQueue([redirected], new Map(), new Map());
    expect(queue).toHaveLength(1);
    expect(queue[0]?.queueStatus).toBe('redirected');
    expect(queue[0]?.replyUrl).toBe('https://reddit.com/r/test/comments/old');
  });

  it('includes saved signals even without drafts', () => {
    const signal = makeSignal({ contentId: 't3_saved' });
    const queue = buildReviewerQueue([signal], new Map(), new Map());
    expect(queue).toHaveLength(1);
  });

  it('can exclude redirected items from active queue', () => {
    const active = makeSignal({
      contentId: 't3_active',
      similarity: {
        status: 'unique',
        redirectRecommended: false,
        similarPosts: [],
      },
    });
    active.status = 'active';

    const redirected = makeSignal({
      contentId: 't3_redirected',
      status: 'redirected',
      similarity: {
        status: 'redirected',
        redirectRecommended: true,
        similarPosts: [],
        redirectTo: {
          contentId: 't3_old',
          similarityScore: 0.9,
          matchReason: 'same title',
          matchMethod: 'heuristic',
          engagement: { score: 1 },
          hasExistingDraft: false,
        },
      },
    });

    const draftMap = new Map([
      [
        't3_active',
        {
          contentId: 't3_active',
          draftedAt: Date.now(),
          model: 'gemini',
          relevance: 'direct' as const,
          relevanceReason: 'test',
          domainMatch: 'test',
          draft: 'draft text',
          postingGuidance: 'test',
        },
      ],
    ]);

    const queue = buildReviewerQueue(
      [active, redirected],
      new Map(),
      draftMap,
      new Map(),
      { excludeRedirected: true }
    );

    expect(queue.map((item) => item.signal.contentId)).toEqual(['t3_active']);
  });

  it('surfaces canonical draft on redirected duplicate posts', () => {
    const redirected = makeSignal({
      contentId: 't3_new',
      status: 'redirected',
      similarity: {
        status: 'redirected',
        redirectRecommended: true,
        similarPosts: [],
        redirectTo: {
          contentId: 't3_old',
          similarityScore: 0.9,
          matchReason: 'same title',
          matchMethod: 'heuristic',
          engagement: { score: 1 },
          hasExistingDraft: true,
        },
      },
    });

    const draftMap = new Map([
      [
        't3_old',
        {
          contentId: 't3_old',
          draftedAt: Date.now(),
          model: 'gemini',
          relevance: 'direct' as const,
          relevanceReason: 'test',
          domainMatch: 'test',
          draft: 'canonical draft text',
          postingGuidance: 'test',
        },
      ],
    ]);

    const queue = buildReviewerQueue([redirected], new Map(), draftMap);
    expect(queue[0]?.commentDraft?.draft).toBe('canonical draft text');
  });
});
