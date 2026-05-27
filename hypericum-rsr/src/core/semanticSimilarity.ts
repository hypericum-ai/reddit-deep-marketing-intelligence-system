import type { CommentDraft } from '../types/commentDraft.js';
import type { Signal } from '../types/signal.js';
import type { SimilarMatch } from '../types/similarity.js';
import { cosineSimilarity } from './embeddings.js';
import {
  SEMANTIC_MATCH_THRESHOLD,
  mergeSimilarityResults,
} from './similarity.js';

export function findSemanticMatches(
  target: Signal,
  targetEmbedding: number[],
  candidates: Signal[],
  embeddingMap: Map<string, number[]>,
  draftMap: Map<string, CommentDraft> = new Map()
): SimilarMatch[] {
  const matches: SimilarMatch[] = [];

  for (const candidate of candidates) {
    if (candidate.contentId === target.contentId) {
      continue;
    }

    const embedding = embeddingMap.get(candidate.contentId);
    if (!embedding) {
      continue;
    }

    const score = cosineSimilarity(targetEmbedding, embedding);
    if (score < SEMANTIC_MATCH_THRESHOLD) {
      continue;
    }

    matches.push({
      contentId: candidate.contentId,
      ...(candidate.permalink !== undefined
        ? { permalink: candidate.permalink }
        : {}),
      ...(candidate.title !== undefined ? { title: candidate.title } : {}),
      similarityScore: Math.round(score * 1000) / 1000,
      matchReason: `${Math.round(score * 100)}% semantic similarity`,
      matchMethod: 'semantic',
      engagement: { ...candidate.engagement },
      hasExistingDraft: draftMap.has(candidate.contentId),
    });
  }

  return matches.sort((a, b) => b.similarityScore - a.similarityScore);
}

export function mergeWithSemanticMatches(
  heuristic: Signal['similarity'],
  semanticMatches: SimilarMatch[]
): Signal['similarity'] {
  return mergeSimilarityResults(heuristic, semanticMatches);
}
