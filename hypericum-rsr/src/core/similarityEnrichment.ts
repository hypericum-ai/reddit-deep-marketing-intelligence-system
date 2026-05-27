import { computeEmbedding } from './embeddings.js';
import {
  filterSimilarityCandidates,
  mergeSimilarityResults,
} from './similarity.js';
import {
  findSemanticMatches,
} from './semanticSimilarity.js';
import { getDrafts } from '../storage/commentDraftStore.js';
import { getEmbeddings, saveEmbedding } from '../storage/embeddingStore.js';
import { listSignals, saveSignal } from '../storage/redisSignalStore.js';

import type { Signal } from '../types/signal.js';

export async function enrichSignalSimilarity(
  signal: Signal,
  apiKey: string
): Promise<Signal> {
  const embedding = await computeEmbedding(
    `${signal.title ?? ''}\n${signal.cleanText}`.trim(),
    apiKey
  );
  await saveEmbedding(signal.contentId, embedding);

  const existingSignals = await listSignals({
    subreddit: signal.subreddit,
    limit: 100,
  });
  const candidates = filterSimilarityCandidates(
    signal.contentId,
    existingSignals
  );
  const candidateIds = candidates.map((s) => s.contentId);
  const [embeddingMap, draftMap] = await Promise.all([
    getEmbeddings(candidateIds),
    getDrafts(candidateIds),
  ]);

  const semanticMatches = findSemanticMatches(
    signal,
    embedding,
    candidates,
    embeddingMap,
    draftMap
  );

  const similarity = mergeSimilarityResults(
    signal.similarity,
    semanticMatches
  );

  const updated: Signal = {
    ...signal,
    similarity,
    status: similarity.redirectRecommended ? 'redirected' : 'active',
    updatedAt: Date.now(),
  };

  await saveSignal(updated, { allowUpdate: true });
  return updated;
}

export function shouldSkipLlmPipeline(signal: Signal): boolean {
  if (signal.status !== 'redirected' || !signal.similarity?.redirectRecommended) {
    return false;
  }
  // Only skip LLM when the canonical thread already has a draft to reply on.
  return signal.similarity.redirectTo?.hasExistingDraft === true;
}
