import { describe, expect, it } from 'vitest';

import { buildCommentDraftPrompt } from './llmCommentDraft.js';
import { buildInsightPrompt } from './llmExtraction.js';
import { COMMENT_DRAFT_MAX_WORDS, COMMENT_DRAFT_MIN_WORDS } from '../generated/llmPrompts.js';
import type { LLMInsight } from '../types/insight.js';
import type { Signal } from '../types/signal.js';

const signal: Signal = {
  contentId: 't3_prompt',
  contentType: 'post',
  subreddit: 'LocalLLaMA',
  author: 'user',
  title: 'RAG fails in prod',
  text: 'Our RAG works in testing but not production.',
  cleanText: 'our rag works in testing but not production.',
  intent: { score: 80, level: 'high', intentType: 'frustration', matchedSignals: [] },
  clusters: ['ai-production-failure'],
  engagement: { score: 5 },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const insight: LLMInsight = {
  contentId: 't3_prompt',
  extractedAt: Date.now(),
  model: 'gemini-2.5-flash',
  painPoint: 'Production RAG inconsistency',
  userContext: 'ML engineer at SaaS vendor',
  currentWorkaround: 'More fine-tuning',
  desiredSolution: 'Stable production outputs',
  emotionalTone: 'frustrated',
  urgency: 'high',
  marketingHook: 'Demo-to-prod RAG gap',
  hypericumDomain: 'ai-production-failure',
};

describe('synced LLM prompts', () => {
  it('embeds word limits in comment draft briefing', () => {
    const prompt = buildCommentDraftPrompt(signal, insight);
    expect(prompt).toContain(`${COMMENT_DRAFT_MIN_WORDS}`);
    expect(prompt).toContain(`${COMMENT_DRAFT_MAX_WORDS}`);
    expect(prompt).toContain('TEFLON LAYER');
    expect(prompt).toContain('CONTEXT LAYER OWNERSHIP');
    expect(prompt).toContain('RUNTIME DISTINCTION');
    expect(prompt).toContain('RAG fails in prod');
    expect(prompt).toContain('ai-production-failure');
  });

  it('keeps insight extraction Hypericum-free but includes domain taxonomy', () => {
    const prompt = buildInsightPrompt(signal);
    expect(prompt.toLowerCase()).not.toContain('hypericum');
    expect(prompt).toContain('problem_domain');
    expect(prompt).toContain('ai-production-failure');
    expect(prompt).toContain('RAG fails in prod');
  });
});
