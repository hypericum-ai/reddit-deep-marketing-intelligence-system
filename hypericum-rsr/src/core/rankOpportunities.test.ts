import { describe, expect, it } from 'vitest';

import { rankOpportunities } from './rankOpportunities.js';
import type { AggregatedCluster } from '../types/signal.js';

describe('rankOpportunities', () => {
  it('ranks higher frequency clusters first', () => {
    const aggregated: Record<string, AggregatedCluster> = {
      alpha: {
        category: 'alpha',
        signals: [],
        frequency: 2,
        avgIntent: 40,
        avgEngagement: 5,
        recentCount24h: 1,
        trendVelocity: 0.5,
      },
      beta: {
        category: 'beta',
        signals: [],
        frequency: 10,
        avgIntent: 40,
        avgEngagement: 5,
        recentCount24h: 5,
        trendVelocity: 0.5,
      },
    };
    const ranked = rankOpportunities(aggregated);
    expect(ranked[0]?.category).toBe('beta');
  });
});
