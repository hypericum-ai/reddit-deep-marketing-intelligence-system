import type { AggregatedCluster, Signal } from '../types/signal.js';
import type { SubredditConfig } from '../types/settings.js';
import { categoryAllowed } from '../types/settings.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function recentCount24h(signals: Signal[], now = Date.now()): number {
  const cutoff = now - MS_PER_DAY;
  return signals.filter((s) => s.createdAt >= cutoff).length;
}

export function aggregateSignals(
  signals: Signal[],
  config?: SubredditConfig
): Record<string, AggregatedCluster> {
  const clusters: Record<string, Signal[]> = {};

  for (const signal of signals) {
    for (const category of signal.clusters) {
      if (config && !categoryAllowed(config, category)) {
        continue;
      }
      (clusters[category] ??= []).push(signal);
    }
  }

  const aggregated: Record<string, AggregatedCluster> = {};

  for (const [category, categorySignals] of Object.entries(clusters)) {
    const frequency = categorySignals.length;
    const avgIntent =
      categorySignals.reduce((sum, s) => sum + s.intent.score, 0) /
      frequency;
    const avgEngagement =
      categorySignals.reduce((sum, s) => sum + s.engagement.score, 0) /
      frequency;
    const recent = recentCount24h(categorySignals);
    const trendVelocity =
      frequency > 0 ? Math.min(1, recent / frequency) : 0;

    aggregated[category] = {
      category,
      signals: categorySignals,
      frequency,
      avgIntent,
      avgEngagement,
      recentCount24h: recent,
      trendVelocity,
    };
  }

  return aggregated;
}
