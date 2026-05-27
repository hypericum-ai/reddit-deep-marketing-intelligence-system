import { describe, expect, it } from 'vitest';

import {
  shouldDraftComment,
  shouldExtractInsight,
  signalMatchesHypericumCluster,
} from './llmPipeline.js';
import type { LLMInsight } from '../types/insight.js';
import type { Signal } from '../types/signal.js';

function baseSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    contentId: 't3_test',
    contentType: 'post',
    subreddit: 'dataengineering',
    author: 'user',
    text: 'sample',
    cleanText: 'sample',
    intent: { score: 50, level: 'medium', intentType: 'general', matchedSignals: [] },
    clusters: [],
    engagement: { score: 1 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function baseInsight(overrides: Partial<LLMInsight> = {}): LLMInsight {
  return {
    contentId: 't3_test',
    extractedAt: Date.now(),
    model: 'gemini-2.5-flash',
    painPoint: 'pain',
    userContext: 'ctx',
    currentWorkaround: 'none',
    desiredSolution: 'fix',
    emotionalTone: 'frustrated',
    urgency: 'high',
    marketingHook: 'hook',
    hypericumDomain: 'n/a',
    ...overrides,
  };
}

describe('llmPipeline thresholds', () => {
  it('extracts insight at score 30+', () => {
    expect(shouldExtractInsight(baseSignal({ intent: { score: 29, level: 'low', intentType: 'general', matchedSignals: [] } }))).toBe(false);
    expect(shouldExtractInsight(baseSignal({ intent: { score: 30, level: 'medium', intentType: 'general', matchedSignals: [] } }))).toBe(true);
  });

  it('drafts only at score 70+ with domain or cluster match', () => {
    const signal = baseSignal({
      intent: { score: 70, level: 'high', intentType: 'frustration', matchedSignals: [] },
      clusters: ['manual-workflow'],
    });
    const insight = baseInsight({ hypericumDomain: 'n/a' });

    expect(shouldDraftComment(signal, insight)).toBe(false);

    expect(
      shouldDraftComment(
        baseSignal({
          intent: { score: 69, level: 'medium', intentType: 'general', matchedSignals: [] },
          clusters: ['ai-production-failure'],
        }),
        baseInsight({ hypericumDomain: 'ai-production-failure' })
      )
    ).toBe(false);

    expect(
      shouldDraftComment(
        baseSignal({
          intent: { score: 80, level: 'high', intentType: 'frustration', matchedSignals: [] },
          clusters: ['ai-production-failure'],
        }),
        baseInsight({ hypericumDomain: 'n/a' })
      )
    ).toBe(false);

    expect(
      shouldDraftComment(
        baseSignal({
          intent: { score: 80, level: 'high', intentType: 'frustration', matchedSignals: [] },
          clusters: ['manual-workflow'],
        }),
        baseInsight({ hypericumDomain: 'regulatory-audit' })
      )
    ).toBe(true);

    expect(
      shouldDraftComment(
        baseSignal({
          intent: { score: 70, level: 'high', intentType: 'frustration', matchedSignals: [] },
          clusters: ['ai-production-failure'],
        }),
        insight
      )
    ).toBe(false);

    expect(
      shouldDraftComment(
        baseSignal({
          intent: { score: 70, level: 'high', intentType: 'frustration', matchedSignals: [] },
          clusters: ['ai-production-failure'],
        }),
        baseInsight({ hypericumDomain: 'ai-production-failure' })
      )
    ).toBe(true);
  });

  it('detects Hypericum cluster membership', () => {
    expect(signalMatchesHypericumCluster(baseSignal({ clusters: ['integration-gaps'] }))).toBe(false);
    expect(
      signalMatchesHypericumCluster(baseSignal({ clusters: ['analytics-reconciliation'] }))
    ).toBe(true);
  });
});
