import { describe, expect, it } from 'vitest';

import {
  DRAFT_MATCH_THRESHOLD,
  DRAFT_PARTIAL_THRESHOLD,
  isRedditPostId,
  postIdFromCommentPermalink,
  scoreDraftSimilarity,
  threadIdsForDraftOwner,
} from './draftEngagement.js';

describe('scoreDraftSimilarity', () => {
  const draft =
    'We had the same LLM classification drift in production. ' +
    'Our fix was a small golden-set regression suite before each deploy.';

  it('scores near-identical comments as posted', () => {
    const comment =
      'Same LLM classification drift here. We added a golden-set regression suite before deploys.';
    const score = scoreDraftSimilarity(draft, comment);
    expect(score).toBeGreaterThanOrEqual(DRAFT_MATCH_THRESHOLD);
  });

  it('scores loosely related comments as partial', () => {
    const comment =
      'LLM drift and classification issues in production — we use regression testing now.';
    const score = scoreDraftSimilarity(draft, comment);
    expect(score).toBeGreaterThanOrEqual(DRAFT_PARTIAL_THRESHOLD);
    expect(score).toBeLessThan(DRAFT_MATCH_THRESHOLD);
  });

  it('ignores unrelated comments below partial threshold', () => {
    const comment = 'Try Postgres instead of Mongo for this workload.';
    expect(scoreDraftSimilarity(draft, comment)).toBeLessThan(DRAFT_PARTIAL_THRESHOLD);
  });
});

describe('postIdFromCommentPermalink', () => {
  it('extracts t3 id from comment permalink', () => {
    expect(
      postIdFromCommentPermalink('/r/test/comments/abc123/title/xyz/')
    ).toBe('t3_abc123');
    expect(
      postIdFromCommentPermalink('https://reddit.com/r/test/comments/t3_abc123/title/xyz/')
    ).toBe('t3_abc123');
  });

  it('returns undefined when permalink has no comments segment', () => {
    expect(postIdFromCommentPermalink('/r/test/')).toBeUndefined();
  });
});

describe('isRedditPostId', () => {
  it('detects post thing ids', () => {
    expect(isRedditPostId('t3_abc')).toBe(true);
    expect(isRedditPostId('t1_abc')).toBe(false);
  });
});

describe('threadIdsForDraftOwner', () => {
  it('includes canonical and duplicate threads for the same draft', () => {
    const signals = [
      {
        contentId: 't3_canonical',
        similarity: { redirectTo: undefined },
      },
      {
        contentId: 't3_duplicate',
        similarity: { redirectTo: { contentId: 't3_canonical' } },
      },
    ] as import('../types/signal.js').Signal[];

    expect(threadIdsForDraftOwner('t3_canonical', signals).sort()).toEqual(
      ['t3_canonical', 't3_duplicate'].sort()
    );
  });
});
