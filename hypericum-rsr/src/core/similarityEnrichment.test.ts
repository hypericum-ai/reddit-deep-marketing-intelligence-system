import { describe, expect, it } from 'vitest';

import type { Signal } from '../types/signal.js';
import { shouldSkipLlmPipeline } from './similarityEnrichment.js';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    contentId: 't3_test',
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

describe('shouldSkipLlmPipeline', () => {
  it('skips LLM when redirect is recommended and canonical has a draft', () => {
    const signal = makeSignal({
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

    expect(shouldSkipLlmPipeline(signal)).toBe(true);
  });

  it('does not skip when similar but canonical has no draft yet', () => {
    const signal = makeSignal({
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

    expect(shouldSkipLlmPipeline(signal)).toBe(false);
  });

  it('does not skip active unique signals', () => {
    expect(shouldSkipLlmPipeline(makeSignal({ status: 'active' }))).toBe(false);
  });
});
