import { EXPORT_MIN_DRAFTED_AT_MS } from '../generated/llmPrompts.js';
import { deleteDraft, getDrafts } from '../storage/commentDraftStore.js';
import { deleteInsight, getInsights } from '../storage/insightStore.js';
import { listSignals } from '../storage/redisSignalStore.js';

export type PurgeStaleLlmResult = {
  scannedSignals: number;
  deletedDrafts: number;
  deletedInsights: number;
  minDraftedAtMs: number;
};

export async function purgeStaleLlmData(
  minDraftedAtMs: number = EXPORT_MIN_DRAFTED_AT_MS
): Promise<PurgeStaleLlmResult> {
  const signals = await listSignals({ limit: 500 });
  const contentIds = signals.map((signal) => signal.contentId);
  const [draftMap, insightMap] = await Promise.all([
    getDrafts(contentIds),
    getInsights(contentIds),
  ]);

  let deletedDrafts = 0;
  let deletedInsights = 0;

  for (const [contentId, draft] of draftMap.entries()) {
    const shouldDelete =
      draft.relevance === 'none' ||
      (minDraftedAtMs > 0 && draft.draftedAt < minDraftedAtMs);

    if (shouldDelete) {
      await deleteDraft(contentId);
      deletedDrafts += 1;
    }
  }

  for (const [contentId, insight] of insightMap.entries()) {
    if (minDraftedAtMs > 0 && insight.extractedAt < minDraftedAtMs) {
      await deleteInsight(contentId);
      deletedInsights += 1;
    }
  }

  return {
    scannedSignals: signals.length,
    deletedDrafts,
    deletedInsights,
    minDraftedAtMs,
  };
}
