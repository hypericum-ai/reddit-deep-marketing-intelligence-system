import { describe, expect, it } from 'vitest';

import { scoreIntent } from './intentScoring.js';

describe('scoreIntent', () => {
  it('detects frustration and assigns intent type', () => {
    const result = scoreIntent('i am frustrated with this manual spreadsheet');
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.intentType).toBe('frustration');
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  });

  it('returns general for neutral text', () => {
    const result = scoreIntent('nice weather today in the city park');
    expect(result.intentType).toBe('general');
    expect(result.score).toBe(0);
    expect(result.level).toBe('low');
  });
});
