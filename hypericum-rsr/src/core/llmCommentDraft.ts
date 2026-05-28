import type { Signal } from '../types/signal.js';
import type { LLMInsight } from '../types/insight.js';
import type { CommentDraft, HypericumRelevance } from '../types/commentDraft.js';
import {
  COMMENT_DRAFT_BRIEFING,
  COMMENT_DRAFT_MAX_WORDS,
  COMMENT_DRAFT_MIN_WORDS,
} from '../generated/llmPrompts.js';
import {
  countWords,
  truncateToWordCount,
  validateDraftWordCount,
} from './draftWordCount.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 25_000;
const MAX_DRAFT_ATTEMPTS = 2;

const VALID_RELEVANCE = new Set<HypericumRelevance>(['direct', 'partial', 'none']);

export type CommentDraftPromptOptions = {
  retryNote?: string;
  additionalContext?: string;
  previousDraft?: string;
};

function buildRegenerationSection(options: CommentDraftPromptOptions): string {
  const previous = options.previousDraft?.trim();
  const extra = options.additionalContext?.trim();
  if (!previous && !extra) {
    return '';
  }

  const lines = [
    '',
    '---',
    'REVIEWER REGENERATION REQUEST',
    'The review team asked for a new draft using the same thread and insight context.',
  ];

  if (previous) {
    lines.push(
      '',
      'Previous draft (reference only — write a fresh version; do not copy verbatim unless it is still the best answer):',
      previous
    );
  }

  if (extra) {
    lines.push('', 'Additional reviewer context (incorporate when relevant):', extra);
  }

  lines.push(
    '',
    'Regenerate the draft using all context above. Respond with the same JSON schema.'
  );

  return lines.join('\n');
}

function buildPrompt(
  signal: Signal,
  insight: LLMInsight,
  options: CommentDraftPromptOptions = {}
): string {
  const title = signal.title ?? '';
  const body = signal.text.slice(0, 2000);
  const subreddit = signal.subreddit;

  const base = COMMENT_DRAFT_BRIEFING.replace('{{SUBREDDIT}}', subreddit)
    .replace('{{POST_TITLE}}', title)
    .replace('{{POST_BODY}}', body)
    .replace('{{PAIN_POINT}}', insight.painPoint)
    .replace('{{USER_CONTEXT}}', insight.userContext)
    .replace('{{CURRENT_WORKAROUND}}', insight.currentWorkaround)
    .replace('{{DESIRED_SOLUTION}}', insight.desiredSolution)
    .replace('{{EMOTIONAL_TONE}}', insight.emotionalTone)
    .replace('{{URGENCY}}', insight.urgency)
    .replace('{{HYPERICUM_DOMAIN}}', insight.hypericumDomain);

  const regeneration = buildRegenerationSection(options);
  const retryNote = options.retryNote?.trim();

  if (retryNote && regeneration) {
    return `${base}${regeneration}\n\n${retryNote}`;
  }
  if (retryNote) {
    return `${base}\n\n${retryNote}`;
  }
  if (regeneration) {
    return `${base}${regeneration}`;
  }
  return base;
}

type GeminiPart = { text?: string; thought?: boolean };
type GeminiCandidate = { content?: { parts?: GeminiPart[] } };
type GeminiResponse = {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
};

const INSTRUCTION_LEAK_PATTERNS = [
  /maintain a helpful/i,
  /practitioner-focused/i,
  /sales language/i,
  /do not use any sales/i,
  /what it does/i,
  /what problems it solves/i,
  /how it works/i,
  /mention hypericum only/i,
  /critical rules/i,
  /never use sales/i,
  /patent pending/i,
  /drafting comments/i,
  /on behalf of hypericum/i,
  /the draft focuses/i,
  /ensure the tone/i,
  /no mention of hypericum/i,
  /no specific edits/i,
  /aligning with the/i,
  /the tone is/i,
  /human review/i,
  /per the rules/i,
  /given the.*relevance/i,
  /as per the/i,
  /without mentioning hypericum/i,
  /good length and flows/i,
  /paragraphs?\)/i,
  /adhering to the/i,
  /matching the user/i,
];

function looksLikeInstructionLeak(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return INSTRUCTION_LEAK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function sanitizePostingGuidance(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || looksLikeInstructionLeak(trimmed)) {
    return '';
  }
  if (trimmed.length > 160) {
    return '';
  }
  return trimmed;
}

export function sanitizeDraftText(raw: string): string {
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const kept = paragraphs.filter((part) => !looksLikeInstructionLeak(part));
  return kept.join('\n\n').trim();
}

function parseDraftJson(raw: string, contentId: string): CommentDraft {
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(clean) as Record<string, unknown>;

  const relevanceRaw = String(parsed['relevance'] ?? 'none').toLowerCase();
  const relevance: HypericumRelevance = VALID_RELEVANCE.has(relevanceRaw as HypericumRelevance)
    ? (relevanceRaw as HypericumRelevance)
    : 'none';

  return {
    contentId,
    draftedAt: Date.now(),
    model: GEMINI_MODEL,
    relevance,
    relevanceReason: String(parsed['relevance_reason'] ?? ''),
    domainMatch: String(parsed['domain_match'] ?? 'n/a'),
    draft: sanitizeDraftText(String(parsed['draft'] ?? '')),
    postingGuidance: sanitizePostingGuidance(String(parsed['posting_guidance'] ?? '')),
  };
}

function wordCountRetryNote(previousWords: number): string {
  return (
    `RETRY — your previous draft was ${previousWords} words. ` +
    `The draft field MUST be ${COMMENT_DRAFT_MIN_WORDS}–${COMMENT_DRAFT_MAX_WORDS} words. ` +
    `One diagnosis sentence, two to three short sentences, optional Hypericum mention last. ` +
    `Count words before responding.`
  );
}

function finalizeDraftBody(draft: CommentDraft, attempt: number): CommentDraft {
  const validation = validateDraftWordCount(draft.draft);
  if (validation.ok) {
    return draft;
  }

  if (validation.reason === 'too_long') {
    if (attempt < MAX_DRAFT_ATTEMPTS - 1) {
      throw new DraftWordCountRetryError(validation.words);
    }
    return {
      ...draft,
      draft: truncateToWordCount(draft.draft, COMMENT_DRAFT_MAX_WORDS),
    };
  }

  if (validation.reason === 'too_short' && attempt < MAX_DRAFT_ATTEMPTS - 1) {
    throw new DraftWordCountRetryError(validation.words);
  }

  return draft;
}

export class DraftWordCountRetryError extends Error {
  constructor(readonly words: number) {
    super(`Draft word count out of range: ${words}`);
    this.name = 'DraftWordCountRetryError';
  }
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          maxOutputTokens: 256,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const json = (await res.json()) as GeminiResponse;

  if (!res.ok) {
    throw new Error(
      `Gemini API error ${res.status}: ${json.error?.message ?? 'unknown'}`
    );
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const answerPart = parts.find((p) => !p.thought) ?? parts[parts.length - 1];
  const text = answerPart?.text ?? '';
  if (!text) {
    throw new Error('Gemini returned empty content for comment draft');
  }

  return text;
}

export async function draftComment(
  signal: Signal,
  insight: LLMInsight,
  apiKey: string,
  promptOptions: Omit<CommentDraftPromptOptions, 'retryNote'> = {}
): Promise<CommentDraft> {
  let retryWords = 0;

  for (let attempt = 0; attempt < MAX_DRAFT_ATTEMPTS; attempt++) {
    const retryNote = attempt > 0 ? wordCountRetryNote(retryWords) : '';
    const prompt = buildPrompt(signal, insight, { ...promptOptions, retryNote });

    try {
      const text = await callGemini(prompt, apiKey);
      const parsed = parseDraftJson(text, signal.contentId);
      return finalizeDraftBody(parsed, attempt);
    } catch (err) {
      if (err instanceof DraftWordCountRetryError) {
        retryWords = err.words;
        continue;
      }
      throw err;
    }
  }

  throw new Error('Failed to produce a comment draft within word limits');
}

export {
  buildPrompt as buildCommentDraftPrompt,
  COMMENT_DRAFT_MIN_WORDS,
  COMMENT_DRAFT_MAX_WORDS,
  countWords,
};
