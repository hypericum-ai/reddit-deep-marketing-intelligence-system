import { describe, expect, it } from 'vitest';

import type { Signal } from '../types/signal.js';
import {
  buildHeuristicSimilarity,
  filterSimilarityCandidates,
  jaccardSimilarity,
  mergeSimilarityResults,
  normalizeTitle,
  scoreHeuristicSimilarity,
  titleSimilarity,
} from './similarity.js';

function makeSignal(overrides: Partial<Signal> & Pick<Signal, 'contentId'>): Signal {
  return {
    contentType: 'post',
    subreddit: 'test',
    author: 'user',
    text: overrides.text ?? 'default body text for testing similarity matching',
    cleanText:
      overrides.cleanText ??
      'default body text for testing similarity matching',
    intent: {
      score: 80,
      level: 'high',
      intentType: 'frustration',
      matchedSignals: overrides.intent?.matchedSignals ?? ['broken', 'problem with'],
    },
    clusters: overrides.clusters ?? ['ai-production-failure'],
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    engagement: overrides.engagement ?? { score: 1, numComments: 0 },
    ...overrides,
  };
}

describe('titleSimilarity', () => {
  it('returns 1 for identical normalized titles', () => {
    expect(
      titleSimilarity(
        'Problem with our deploy pipeline — any better way?',
        'problem with our deploy pipeline any better way'
      )
    ).toBe(1);
  });

  it('returns low score for unrelated titles', () => {
    expect(titleSimilarity('deploy pipeline broken', 'taxonomies mismatch')).toBeLessThan(
      0.5
    );
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical token sets', () => {
    expect(
      jaccardSimilarity(
        new Set(['deploy', 'pipeline', 'broken']),
        new Set(['deploy', 'pipeline', 'broken'])
      )
    ).toBe(1);
  });
});

describe('buildHeuristicSimilarity', () => {
  it('detects near-duplicate posts with the same title', () => {
    const target = makeSignal({
      contentId: 't3_new',
      title: 'Problem with our deploy pipeline — any better way?',
      cleanText:
        'our deploy pipeline keeps failing in production and we need a better way',
      createdAt: Date.now(),
    });

    const existing = makeSignal({
      contentId: 't3_old',
      title: 'Problem with our deploy pipeline — any better way?',
      cleanText:
        'our deploy pipeline keeps failing in production and we need a better way',
      createdAt: Date.now() - 60_000,
      engagement: { score: 5, numComments: 2 },
    });

    const result = buildHeuristicSimilarity(target, [existing]);

    expect(result.status).toBe('redirected');
    expect(result.redirectRecommended).toBe(true);
    expect(result.redirectTo?.contentId).toBe('t3_old');
    expect(result.similarPosts).toHaveLength(1);
    expect(result.similarPosts[0]?.similarityScore).toBeGreaterThanOrEqual(0.8);
  });

  it('returns unique when no candidates match', () => {
    const target = makeSignal({
      contentId: 't3_a',
      title: 'taxonomy mismatch after acquisition',
      cleanText: 'merged product catalogues with incompatible categories',
    });
    const other = makeSignal({
      contentId: 't3_b',
      title: 'how to tune llm temperature',
      cleanText: 'looking for advice on temperature settings for chat models',
    });

    const result = buildHeuristicSimilarity(target, [other]);
    expect(result.status).toBe('unique');
    expect(result.redirectRecommended).toBe(false);
  });

  it('prefers the canonical thread with an existing draft', () => {
    const target = makeSignal({
      contentId: 't3_new',
      title: 'Problem with our deploy pipeline — any better way?',
      cleanText: 'deploy pipeline broken in production need help',
    });
    const older = makeSignal({
      contentId: 't3_old',
      title: 'Problem with our deploy pipeline — any better way?',
      cleanText: 'deploy pipeline broken in production need help',
      engagement: { score: 1, numComments: 0 },
    });
    const popular = makeSignal({
      contentId: 't3_popular',
      title: 'Problem with our deploy pipeline — any better way?',
      cleanText: 'deploy pipeline broken in production need help',
      engagement: { score: 50, numComments: 10 },
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
          draft: 'existing draft',
          postingGuidance: 'test',
        },
      ],
    ]);

    const result = buildHeuristicSimilarity(
      target,
      [older, popular],
      draftMap
    );

    expect(result.redirectTo?.contentId).toBe('t3_old');
    expect(result.redirectTo?.hasExistingDraft).toBe(true);
  });
});

describe('mergeSimilarityResults', () => {
  it('combines semantic matches with heuristic results', () => {
    const heuristic = buildHeuristicSimilarity(
      makeSignal({
        contentId: 't3_new',
        title: 'pipeline issues',
        cleanText: 'ci pipeline keeps failing on deploy',
      }),
      [
        makeSignal({
          contentId: 't3_old',
          title: 'different title entirely',
          cleanText: 'unrelated content about databases',
        }),
      ]
    );

    const semanticMatches = [
      {
        contentId: 't3_sem',
        permalink: '/r/test/comments/sem',
        title: 'CI keeps failing',
        similarityScore: 0.88,
        matchReason: '88% semantic similarity',
        matchMethod: 'semantic' as const,
        engagement: { score: 3, numComments: 1 },
        hasExistingDraft: false,
      },
    ];

    const merged = mergeSimilarityResults(heuristic, semanticMatches);
    expect(merged.similarPosts.some((m) => m.contentId === 't3_sem')).toBe(true);
    expect(merged.redirectRecommended).toBe(true);
    expect(merged.redirectTo?.contentId).toBe('t3_sem');
  });
});

describe('filterSimilarityCandidates', () => {
  it('excludes self and stale posts', () => {
    const target = makeSignal({ contentId: 't3_target' });
    const recent = makeSignal({
      contentId: 't3_recent',
      createdAt: Date.now() - 1000,
    });
    const stale = makeSignal({
      contentId: 't3_stale',
      createdAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
    });

    const filtered = filterSimilarityCandidates(target.contentId, [
      target,
      recent,
      stale,
    ]);

    expect(filtered.map((s) => s.contentId)).toEqual(['t3_recent']);
  });
});

describe('normalizeTitle', () => {
  it('strips punctuation and extra spaces', () => {
    expect(normalizeTitle('Hello — World!!!')).toBe('hello world');
  });
});

describe('scoreHeuristicSimilarity', () => {
  it('includes match reasons for strong overlap', () => {
    const left = makeSignal({
      contentId: 'a',
      title: 'deploy pipeline broken',
      cleanText: 'deploy pipeline broken in production',
      clusters: ['integration-gaps'],
      intent: {
        score: 90,
        level: 'high',
        intentType: 'frustration',
        matchedSignals: ['broken', 'problem with'],
      },
    });
    const right = makeSignal({
      contentId: 'b',
      title: 'deploy pipeline broken',
      cleanText: 'deploy pipeline broken in production',
      clusters: ['integration-gaps'],
      intent: {
        score: 90,
        level: 'high',
        intentType: 'frustration',
        matchedSignals: ['broken', 'problem with'],
      },
    });

    const scored = scoreHeuristicSimilarity(left, right);
    expect(scored.score).toBeGreaterThanOrEqual(0.8);
    expect(scored.reasons).toContain('same title');
  });
});
