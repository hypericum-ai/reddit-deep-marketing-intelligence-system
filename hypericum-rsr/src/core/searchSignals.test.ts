import { describe, expect, it } from 'vitest';

import { searchStoredSignals } from './searchSignals.js';
import type { LLMInsight } from '../types/insight.js';
import type { Signal } from '../types/signal.js';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    contentId: 't3_test',
    contentType: 'post',
    subreddit: 'hypericum_rsr_dev',
    author: 'user',
    title: 'RAG copilot inconsistent in production',
    text: 'Our RAG pipeline works in staging but fails in production with hallucinated entity codes.',
    cleanText:
      'our rag pipeline works in staging but fails in production with hallucinated entity codes',
    intent: { score: 90, level: 'high', intentType: 'frustration', matchedSignals: [] },
    clusters: ['ai-production-failure'],
    engagement: { score: 12 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const insight: LLMInsight = {
  contentId: 't3_test',
  extractedAt: Date.now(),
  model: 'gemini-2.5-flash',
  painPoint: 'Production RAG inconsistency across tenants',
  userContext: 'SaaS vendor',
  currentWorkaround: 'Manual review',
  desiredSolution: 'Governed classification upstream',
  emotionalTone: 'frustrated',
  urgency: 'high',
  marketingHook: 'Demo-to-prod gap',
  hypericumDomain: 'ai-production-failure',
};

describe('searchStoredSignals', () => {
  it('returns ranked hits for keyword queries', () => {
    const other = makeSignal({
      contentId: 't3_other',
      title: 'Spreadsheet reconciliation pain',
      text: 'Finance and product disagree on revenue numbers every month.',
      cleanText: 'finance and product disagree on revenue numbers every month',
      clusters: ['analytics-reconciliation'],
    });

    const hits = searchStoredSignals(
      [other, makeSignal()],
      new Map([[insight.contentId, insight]]),
      new Map(),
      'rag production hallucinated'
    );

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.contentId).toBe('t3_test');
    expect(hits[0]?.hypericumDomain).toBe('ai-production-failure');
  });

  it('matches hypericum domain slugs', () => {
    const hits = searchStoredSignals(
      [makeSignal()],
      new Map([[insight.contentId, insight]]),
      new Map(),
      'ai-production-failure'
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchReason).toContain('domain ai-production-failure');
  });

  it('returns empty results when nothing matches', () => {
    const hits = searchStoredSignals(
      [makeSignal()],
      new Map([[insight.contentId, insight]]),
      new Map(),
      'completely unrelated topic xyz'
    );

    expect(hits).toHaveLength(0);
  });
});
