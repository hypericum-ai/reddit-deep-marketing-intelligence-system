import type { CommentDraft } from '../types/commentDraft.js';
import type { LLMInsight } from '../types/insight.js';
import type { Signal } from '../types/signal.js';
import { jaccardSimilarity, normalizeTitle } from './similarity.js';

export type SignalSearchHit = {
  contentId: string;
  subreddit: string;
  title?: string;
  intentScore: number;
  clusters: string[];
  hypericumDomain?: string;
  painPoint?: string;
  draftPreview?: string;
  relevance?: string;
  queueStatus: 'active' | 'redirected';
  permalink?: string;
  matchScore: number;
  matchReason: string;
};

export type SearchStoredSignalsOptions = {
  limit?: number;
  minScore?: number;
};

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1)
  );
}

function buildSearchDocument(
  signal: Signal,
  insight?: LLMInsight,
  draft?: CommentDraft
): string {
  return [
    signal.title,
    signal.text,
    signal.cleanText,
    signal.clusters.join(' '),
    insight?.painPoint,
    insight?.userContext,
    insight?.desiredSolution,
    insight?.hypericumDomain,
    insight?.marketingHook,
    draft?.draft,
    draft?.relevance,
  ]
    .filter(Boolean)
    .join('\n');
}

function scoreQueryMatch(
  query: string,
  signal: Signal,
  insight?: LLMInsight,
  draft?: CommentDraft
): { score: number; reason: string } | undefined {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return undefined;
  }

  const queryTokens = tokenSet(normalizedQuery);
  if (queryTokens.size === 0) {
    return undefined;
  }

  const document = buildSearchDocument(signal, insight, draft).toLowerCase();
  const docTokens = tokenSet(document);
  const overlap = [...queryTokens].filter((token) => docTokens.has(token)).length;
  if (overlap === 0 && !document.includes(normalizedQuery)) {
    return undefined;
  }

  const tokenCoverage = overlap / queryTokens.size;
  const jaccard = jaccardSimilarity(queryTokens, docTokens);
  const title = normalizeTitle(signal.title);
  const titleBoost =
    title.includes(normalizedQuery) || normalizedQuery.includes(title) ? 0.25 : 0;
  const phraseBoost = document.includes(normalizedQuery) ? 0.2 : 0;
  const clusterBoost = signal.clusters.some((cluster) =>
    normalizedQuery.includes(cluster.replaceAll('-', ' '))
  )
    ? 0.15
    : 0;
  const domainBoost =
    insight?.hypericumDomain &&
    (normalizedQuery.includes(insight.hypericumDomain.replaceAll('-', ' ')) ||
      insight.hypericumDomain.includes(normalizedQuery.replaceAll(' ', '-')))
      ? 0.15
      : 0;

  const score = Math.min(
    1,
    tokenCoverage * 0.45 + jaccard * 0.35 + titleBoost + phraseBoost + clusterBoost + domainBoost
  );

  const reasons: string[] = [];
  if (titleBoost > 0) {
    reasons.push('title match');
  }
  if (phraseBoost > 0) {
    reasons.push('phrase match');
  }
  if (overlap > 0) {
    reasons.push(`${overlap} keyword${overlap === 1 ? '' : 's'}`);
  }
  if (domainBoost > 0 && insight?.hypericumDomain) {
    reasons.push(`domain ${insight.hypericumDomain}`);
  }
  if (clusterBoost > 0) {
    reasons.push('cluster match');
  }

  return {
    score: Math.round(score * 1000) / 1000,
    reason: reasons.join(', ') || 'text similarity',
  };
}

export function searchStoredSignals(
  signals: Signal[],
  insightMap: Map<string, LLMInsight>,
  draftMap: Map<string, CommentDraft>,
  query: string,
  options: SearchStoredSignalsOptions = {}
): SignalSearchHit[] {
  const limit = options.limit ?? 20;
  const minScore = options.minScore ?? 0.12;
  const hits: SignalSearchHit[] = [];

  for (const signal of signals) {
    const insight = insightMap.get(signal.contentId);
    const draft = draftMap.get(signal.contentId);
    const scored = scoreQueryMatch(query, signal, insight, draft);
    if (!scored || scored.score < minScore) {
      continue;
    }

    hits.push({
      contentId: signal.contentId,
      subreddit: signal.subreddit,
      ...(signal.title !== undefined ? { title: signal.title } : {}),
      intentScore: signal.intent.score,
      clusters: signal.clusters,
      ...(insight?.hypericumDomain ? { hypericumDomain: insight.hypericumDomain } : {}),
      ...(insight?.painPoint ? { painPoint: insight.painPoint } : {}),
      ...(draft?.draft
        ? { draftPreview: draft.draft.slice(0, 180) }
        : {}),
      ...(draft?.relevance ? { relevance: draft.relevance } : {}),
      queueStatus:
        signal.status === 'redirected' || signal.similarity?.redirectRecommended
          ? 'redirected'
          : 'active',
      ...(signal.permalink !== undefined ? { permalink: signal.permalink } : {}),
      matchScore: scored.score,
      matchReason: scored.reason,
    });
  }

  return hits
    .sort((a, b) => b.matchScore - a.matchScore || b.intentScore - a.intentScore)
    .slice(0, limit);
}

export { buildSearchDocument, scoreQueryMatch };
