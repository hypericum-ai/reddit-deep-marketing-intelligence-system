import type { Signal } from '../types/signal.js';
import type { LLMInsight, EmotionalTone, UrgencyLevel } from '../types/insight.js';
import { normalizeHypericumDomain } from '../types/hypericumDomain.js';
import { INSIGHT_EXTRACTION_TEMPLATE } from '../generated/llmPrompts.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 20_000;

const VALID_TONES = new Set<EmotionalTone>([
  'frustrated',
  'annoyed',
  'curious',
  'desperate',
  'hopeful',
  'neutral',
]);

const VALID_URGENCY = new Set<UrgencyLevel>(['high', 'medium', 'low']);

function buildPrompt(signal: Signal): string {
  const title = signal.title ?? '';
  const body = signal.text.slice(0, 1500);

  return INSIGHT_EXTRACTION_TEMPLATE.replace('{{POST_TITLE}}', title).replace(
    '{{POST_BODY}}',
    body
  );
}

type GeminiPart = { text?: string; thought?: boolean };

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
};

function parseInsightJson(raw: string, contentId: string): LLMInsight {
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(clean) as Record<string, unknown>;

  const tone = String(parsed['emotional_tone'] ?? 'neutral').toLowerCase();
  const urgency = String(parsed['urgency'] ?? 'medium').toLowerCase();

  return {
    contentId,
    extractedAt: Date.now(),
    model: GEMINI_MODEL,
    painPoint: String(parsed['pain_point'] ?? ''),
    userContext: String(parsed['user_context'] ?? ''),
    currentWorkaround: String(parsed['current_workaround'] ?? ''),
    desiredSolution: String(parsed['desired_solution'] ?? ''),
    emotionalTone: VALID_TONES.has(tone as EmotionalTone)
      ? (tone as EmotionalTone)
      : 'neutral',
    urgency: VALID_URGENCY.has(urgency as UrgencyLevel)
      ? (urgency as UrgencyLevel)
      : 'medium',
    marketingHook: String(parsed['marketing_hook'] ?? ''),
    hypericumDomain: normalizeHypericumDomain(
      String(parsed['problem_domain'] ?? parsed['hypericum_domain'] ?? 'n/a')
    ),
  };
}

export async function extractInsight(
  signal: Signal,
  apiKey: string
): Promise<LLMInsight> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(signal) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 512,
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
    throw new Error(`Gemini API error ${res.status}: ${json.error?.message ?? 'unknown'}`);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const answerPart = parts.find((p) => !p.thought) ?? parts[parts.length - 1];
  const text = answerPart?.text ?? '';
  if (!text) {
    throw new Error('Gemini returned empty content');
  }

  return parseInsightJson(text, signal.contentId);
}

export { buildPrompt as buildInsightPrompt };
