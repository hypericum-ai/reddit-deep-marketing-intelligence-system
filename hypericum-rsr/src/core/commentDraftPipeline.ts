import type { Signal } from '../types/signal.js';
import type { LLMInsight } from '../types/insight.js';
import type { CommentDraft } from '../types/commentDraft.js';
import { draftComment } from './llmCommentDraft.js';
import { shouldDraftComment } from './llmPipeline.js';

export class DraftNotApplicableError extends Error {
  constructor(
    message: string,
    readonly reason: 'off_domain' | 'relevance_none' | 'word_count'
  ) {
    super(message);
    this.name = 'DraftNotApplicableError';
  }
}

export function shouldPersistDraft(draft: CommentDraft): boolean {
  return draft.relevance !== 'none';
}

export async function generateCommentDraft(
  signal: Signal,
  insight: LLMInsight,
  apiKey: string
): Promise<CommentDraft> {
  if (!shouldDraftComment(signal, insight)) {
    throw new DraftNotApplicableError(
      `Skipping draft for ${signal.contentId}: off-domain (domain=${insight.hypericumDomain})`,
      'off_domain'
    );
  }

  const draft = await draftComment(signal, insight, apiKey);

  if (!shouldPersistDraft(draft)) {
    throw new DraftNotApplicableError(
      `Skipping draft for ${signal.contentId}: relevance=none`,
      'relevance_none'
    );
  }

  return draft;
}
