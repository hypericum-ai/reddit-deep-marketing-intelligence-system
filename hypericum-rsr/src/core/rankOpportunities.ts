import type { AggregatedCluster, RankedOpportunity } from '../types/signal.js';

function normalize(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(100, (value / max) * 100);
}

export function rankOpportunities(
  aggregated: Record<string, AggregatedCluster>
): RankedOpportunity[] {
  const ranked: RankedOpportunity[] = [];

  for (const cluster of Object.values(aggregated)) {
    const frequencyScore = normalize(cluster.frequency, 50);
    const urgency = normalize(cluster.avgIntent, 100);
    const engagement = normalize(cluster.avgEngagement, 500);
    const trendVelocity = normalize(cluster.trendVelocity, 1);

    const opportunityScore = Math.round(
      frequencyScore * 0.4 +
        urgency * 0.3 +
        engagement * 0.2 +
        trendVelocity * 0.1
    );

    ranked.push({
      category: cluster.category,
      frequency: cluster.frequency,
      avgIntent: Math.round(cluster.avgIntent * 10) / 10,
      avgEngagement: Math.round(cluster.avgEngagement * 10) / 10,
      trendVelocity: Math.round(cluster.trendVelocity * 100) / 100,
      urgency: Math.round(urgency),
      opportunityScore,
    });
  }

  return ranked.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
