import { settings } from '@devvit/web/server';

import {
  DraftNotApplicableError,
  generateCommentDraft,
} from '../core/commentDraftPipeline.js';
import { extractInsight } from '../core/llmExtraction.js';
import {
  enrichSignalSimilarity,
  shouldSkipLlmPipeline,
} from '../core/similarityEnrichment.js';
import { initDraftEngagement } from '../core/draftEngagement.js';
import {
  shouldDraftComment,
  shouldExtractInsight,
} from '../core/llmPipeline.js';
import { insightExists, saveInsight, getInsight } from '../storage/insightStore.js';
import { draftExists, saveDraft } from '../storage/commentDraftStore.js';
import type { Signal } from '../types/signal.js';

async function maybeEnrichSimilarity(signal: Signal, apiKey: string): Promise<Signal> {
  try {
    return await enrichSignalSimilarity(signal, apiKey);
  } catch (err) {
    console.error(`RSR similarity: semantic enrichment failed for ${signal.contentId}:`, err);
    return signal;
  }
}

export async function maybeExtractInsightAndDraft(signal: Signal): Promise<void> {
  if (!shouldExtractInsight(signal)) return;

  if (shouldSkipLlmPipeline(signal)) {
    console.log(
      `RSR LLM: skipping insight/draft for ${signal.contentId}` +
      ` — reply on ${signal.similarity?.redirectTo?.contentId ?? 'canonical thread'} instead`
    );
    return;
  }

  try {
    const apiKey = (await settings.get<string>('geminiApiKey')) ?? '';
    if (!apiKey) return;

    const enriched = await maybeEnrichSimilarity(signal, apiKey);
    if (shouldSkipLlmPipeline(enriched)) {
      console.log(
        `RSR LLM: skipping insight/draft for ${enriched.contentId}` +
        ` — reply on ${enriched.similarity?.redirectTo?.contentId ?? 'canonical thread'} instead`
      );
      return;
    }

    let insight = await getInsight(enriched.contentId).catch(() => undefined);
    if (!insight) {
      if (await insightExists(enriched.contentId)) return;
      insight = await extractInsight(enriched, apiKey);
      await saveInsight(insight);
      console.log(
        `RSR LLM insight: ${enriched.contentId}  domain=${insight.hypericumDomain}` +
        `  hook="${insight.marketingHook}"  tone=${insight.emotionalTone}  urgency=${insight.urgency}`
      );
    }

    if (!shouldDraftComment(enriched, insight)) {
      console.log(
        `RSR LLM: skipping draft for ${enriched.contentId}` +
        ` — score=${enriched.intent.score}, domain=${insight.hypericumDomain},` +
        ` clusters=${enriched.clusters.join(',') || 'none'}`
      );
      return;
    }

    if (await draftExists(enriched.contentId)) return;

    try {
      const draft = await generateCommentDraft(enriched, insight, apiKey);
      await saveDraft(draft);
      await initDraftEngagement(enriched.contentId);
      console.log(
        `RSR LLM draft: ${enriched.contentId}  relevance=${draft.relevance}` +
        `  domain="${draft.domainMatch}"  words=${draft.draft.split(/\s+/).filter(Boolean).length}`
      );
    } catch (err) {
      if (err instanceof DraftNotApplicableError) {
        console.log(`RSR LLM: ${err.message}`);
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error(`RSR LLM: pipeline failed for ${signal.contentId}:`, err);
  }
}
