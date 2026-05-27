import { describe, expect, it } from 'vitest';

import { aggregateSignals } from './aggregateSignals.js';
import type { Signal } from '../types/signal.js';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    contentId: 't3_abc',
    contentType: 'post',
    subreddit: 'test',
    author: 'user',
    text: 'manual spreadsheet workflow',
    cleanText: 'manual spreadsheet workflow',
    intent: {
      score: 50,
      level: 'medium',
      intentType: 'complaint',
      matchedSignals: ['spreadsheet'],
    },
    clusters: ['spreadsheet-fatigue', 'manual-workflow'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    engagement: { score: 10 },
    ...overrides,
  };
}

describe('aggregateSignals', () => {
  it('groups by cluster and computes frequency', () => {
    const signals = [
      makeSignal(),
      makeSignal({ contentId: 't3_def', clusters: ['spreadsheet-fatigue'] }),
    ];
    const result = aggregateSignals(signals);
    expect(result['spreadsheet-fatigue']?.frequency).toBe(2);
  });

  it('filters categories when config restricts slugs', () => {
    const signals = [makeSignal()];
    const result = aggregateSignals(signals, {
      minIntentScore: 30,
      minTextLength: 40,
      enabledCategories: ['devtools-pain'],
    });
    expect(result['spreadsheet-fatigue']).toBeUndefined();
    expect(Object.keys(result)).toHaveLength(0);
  });
});
