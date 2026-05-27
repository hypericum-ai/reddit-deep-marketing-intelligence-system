import type { CommentDraft } from '../types/commentDraft.js';
import type { Signal } from '../types/signal.js';
import type {
  SimilarMatch,
  SimilarMatchMethod,
  SimilarityResult,
} from '../types/similarity.js';

export const SIMILARITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const HEURISTIC_REDIRECT_THRESHOLD = 0.8;
export const HEURISTIC_MATCH_THRESHOLD = 0.5;
export const SEMANTIC_REDIRECT_THRESHOLD = 0.85;
export const SEMANTIC_MATCH_THRESHOLD = 0.75;
export const JACCARD_STRONG_THRESHOLD = 0.6;
export const TITLE_STRONG_THRESHOLD = 0.9;

function tokenSet(cleanText: string): Set<string> {
  return new Set(cleanText.split(/\s+/).filter((t) => t.length > 1));
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function normalizeTitle(title?: string): string {
  return (title ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleSimilarity(a?: string, b?: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }

  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) {
    return 0;
  }

  const distance = levenshteinDistance(left, right);
  return Math.max(0, 1 - distance / maxLen);
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0)
  );

  for (let i = 0; i < rows; i++) {
    matrix[i]![0] = i;
  }
  for (let j = 0; j < cols; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

function sharedRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const setB = new Set(b);
  const shared = a.filter((item) => setB.has(item)).length;
  return shared / Math.max(a.length, b.length);
}

export type HeuristicScore = {
  score: number;
  reasons: string[];
};

export function scoreHeuristicSimilarity(
  target: Signal,
  candidate: Signal
): HeuristicScore {
  const reasons: string[] = [];
  const titleScore = titleSimilarity(target.title, candidate.title);
  const jaccard = jaccardSimilarity(
    tokenSet(target.cleanText),
    tokenSet(candidate.cleanText)
  );
  const clusterScore = sharedRatio(target.clusters, candidate.clusters);
  const signalScore = sharedRatio(
    target.intent.matchedSignals,
    candidate.intent.matchedSignals
  );

  if (titleScore >= TITLE_STRONG_THRESHOLD) {
    reasons.push('same title');
  }
  if (jaccard >= JACCARD_STRONG_THRESHOLD) {
    reasons.push(`${Math.round(jaccard * 100)}% text overlap`);
  }
  if (clusterScore >= 0.5) {
    reasons.push('shared clusters');
  }
  if (signalScore >= 0.5) {
    reasons.push('shared intent phrases');
  }

  const score =
    titleScore * 0.4 +
    jaccard * 0.4 +
    clusterScore * 0.1 +
    signalScore * 0.1;

  if (reasons.length === 0 && score >= HEURISTIC_MATCH_THRESHOLD) {
    reasons.push('combined text and topic overlap');
  }

  return { score, reasons };
}

function toSimilarMatch(
  candidate: Signal,
  score: number,
  reasons: string[],
  method: SimilarMatchMethod,
  draftMap: Map<string, CommentDraft>
): SimilarMatch {
  return {
    contentId: candidate.contentId,
    ...(candidate.permalink !== undefined
      ? { permalink: candidate.permalink }
      : {}),
    ...(candidate.title !== undefined ? { title: candidate.title } : {}),
    similarityScore: roundScore(score),
    matchReason: reasons.join(', ') || 'similar content',
    matchMethod: method,
    engagement: { ...candidate.engagement },
    hasExistingDraft: draftMap.has(candidate.contentId),
  };
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

function pickCanonicalMatch(matches: SimilarMatch[]): SimilarMatch | undefined {
  if (matches.length === 0) {
    return undefined;
  }

  const sorted = [...matches].sort((a, b) => {
    if (a.hasExistingDraft !== b.hasExistingDraft) {
      return a.hasExistingDraft ? -1 : 1;
    }
    const engagementA =
      a.engagement.score + (a.engagement.numComments ?? 0) * 2;
    const engagementB =
      b.engagement.score + (b.engagement.numComments ?? 0) * 2;
    if (engagementA !== engagementB) {
      return engagementB - engagementA;
    }
    return b.similarityScore - a.similarityScore;
  });

  return sorted[0];
}

export function buildHeuristicSimilarity(
  target: Signal,
  candidates: Signal[],
  draftMap: Map<string, CommentDraft> = new Map(),
  redirectThreshold = HEURISTIC_REDIRECT_THRESHOLD,
  matchThreshold = HEURISTIC_MATCH_THRESHOLD
): SimilarityResult {
  const matches: SimilarMatch[] = [];

  for (const candidate of candidates) {
    if (candidate.contentId === target.contentId) {
      continue;
    }

    const { score, reasons } = scoreHeuristicSimilarity(target, candidate);
    if (score < matchThreshold) {
      continue;
    }

    matches.push(
      toSimilarMatch(candidate, score, reasons, 'heuristic', draftMap)
    );
  }

  matches.sort((a, b) => b.similarityScore - a.similarityScore);

  const redirectTo = pickCanonicalMatch(
    matches.filter((m) => m.similarityScore >= redirectThreshold)
  );
  const redirectRecommended = redirectTo !== undefined;

  let status: SimilarityResult['status'] = 'unique';
  if (redirectRecommended) {
    status = 'redirected';
  } else if (matches.length > 0) {
    status = 'similar';
  }

  return {
    similarPosts: matches.slice(0, 5),
    ...(redirectTo !== undefined ? { redirectTo } : {}),
    redirectRecommended,
    status,
  };
}

export function mergeSimilarityResults(
  heuristic: SimilarityResult | undefined,
  semanticMatches: SimilarMatch[],
  redirectThreshold = HEURISTIC_REDIRECT_THRESHOLD
): SimilarityResult {
  const byId = new Map<string, SimilarMatch>();

  for (const match of heuristic?.similarPosts ?? []) {
    byId.set(match.contentId, match);
  }

  for (const semantic of semanticMatches) {
    const existing = byId.get(semantic.contentId);
    if (!existing) {
      byId.set(semantic.contentId, semantic);
      continue;
    }

    const combinedScore = Math.max(existing.similarityScore, semantic.similarityScore);
    byId.set(semantic.contentId, {
      ...existing,
      similarityScore: roundScore(combinedScore),
      matchMethod: 'combined',
      matchReason: [existing.matchReason, semantic.matchReason]
        .filter(Boolean)
        .join('; '),
    });
  }

  const merged = [...byId.values()].sort(
    (a, b) => b.similarityScore - a.similarityScore
  );

  const redirectCandidates = merged.filter((match) => {
    if (match.matchMethod === 'semantic') {
      return match.similarityScore >= SEMANTIC_REDIRECT_THRESHOLD;
    }
    if (match.matchMethod === 'combined') {
      return match.similarityScore >= redirectThreshold;
    }
    return match.similarityScore >= redirectThreshold;
  });

  const redirectTo = pickCanonicalMatch(redirectCandidates);
  const redirectRecommended = redirectTo !== undefined;

  let status: SimilarityResult['status'] = 'unique';
  if (redirectRecommended) {
    status = 'redirected';
  } else if (merged.length > 0) {
    status = 'similar';
  }

  return {
    similarPosts: merged.slice(0, 5),
    ...(redirectTo !== undefined ? { redirectTo } : {}),
    redirectRecommended,
    status,
  };
}

export function filterSimilarityCandidates(
  targetContentId: string,
  candidates: Signal[],
  now = Date.now(),
  windowMs = SIMILARITY_WINDOW_MS
): Signal[] {
  return candidates.filter(
    (candidate) =>
      candidate.contentId !== targetContentId &&
      now - candidate.createdAt <= windowMs
  );
}
