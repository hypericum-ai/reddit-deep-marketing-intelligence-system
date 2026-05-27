import { describe, expect, it } from 'vitest';

import { cosineSimilarity } from './embeddings.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });
});
