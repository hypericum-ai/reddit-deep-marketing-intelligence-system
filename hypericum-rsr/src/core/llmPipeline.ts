import {
  DRAFT_INTENT_THRESHOLD,
  HYPERICUM_DOMAIN_CLUSTERS,
  INSIGHT_INTENT_THRESHOLD,
} from '../generated/llmPrompts.js';
import type { LLMInsight } from '../types/insight.js';
import type { Signal } from '../types/signal.js';

export { DRAFT_INTENT_THRESHOLD, INSIGHT_INTENT_THRESHOLD };

export function signalMatchesHypericumCluster(signal: Signal): boolean {
  return signal.clusters.some((cluster) =>
    (HYPERICUM_DOMAIN_CLUSTERS as readonly string[]).includes(cluster)
  );
}

export function insightMatchesHypericumDomain(insight: LLMInsight): boolean {
  return insight.hypericumDomain !== 'n/a';
}

export function shouldExtractInsight(signal: Signal): boolean {
  return signal.intent.score >= INSIGHT_INTENT_THRESHOLD;
}

export function shouldDraftComment(signal: Signal, insight: LLMInsight): boolean {
  if (signal.intent.score < DRAFT_INTENT_THRESHOLD) {
    return false;
  }
  if (insight.hypericumDomain === 'n/a') {
    return false;
  }
  return (
    insightMatchesHypericumDomain(insight) || signalMatchesHypericumCluster(signal)
  );
}
