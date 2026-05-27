import { EXPORT_MIN_DRAFTED_AT_MS } from '../generated/llmPrompts.js';
import type { CommentDraft } from '../types/commentDraft.js';
import type { LLMInsight } from '../types/insight.js';
import type { Signal } from '../types/signal.js';

export function parseExportMinDraftedAtMs(iso: string | null | undefined): number {
  if (!iso) {
    return 0;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function isDraftExportEligible(
  draft: CommentDraft | undefined,
  minDraftedAtMs: number = EXPORT_MIN_DRAFTED_AT_MS
): draft is CommentDraft {
  if (!draft) {
    return false;
  }
  if (draft.relevance === 'none') {
    return false;
  }
  if (minDraftedAtMs > 0 && draft.draftedAt < minDraftedAtMs) {
    return false;
  }
  return true;
}

export function filterSignalsForExport<T extends Signal>(
  signals: T[],
  draftMap: Map<string, CommentDraft>,
  insightMap: Map<string, LLMInsight>,
  minDraftedAtMs: number = EXPORT_MIN_DRAFTED_AT_MS
): T[] {
  return signals.filter((signal) => {
    const draft = draftMap.get(signal.contentId);
    if (draft) {
      return isDraftExportEligible(draft, minDraftedAtMs);
    }

    const insight = insightMap.get(signal.contentId);
    if (insight && minDraftedAtMs > 0 && insight.extractedAt < minDraftedAtMs) {
      return false;
    }

    return minDraftedAtMs === 0 || signal.updatedAt >= minDraftedAtMs;
  });
}
