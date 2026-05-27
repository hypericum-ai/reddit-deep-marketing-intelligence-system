import {
  COMMENT_DRAFT_MAX_WORDS,
  COMMENT_DRAFT_MIN_WORDS,
} from '../generated/llmPrompts.js';

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function truncateToWordCount(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return text.trim();
  }
  return `${words.slice(0, maxWords).join(' ')}…`;
}

export type DraftWordCountResult =
  | { ok: true; text: string; words: number }
  | { ok: false; words: number; reason: 'empty' | 'too_long' | 'too_short' };

export function validateDraftWordCount(
  text: string,
  minWords: number = COMMENT_DRAFT_MIN_WORDS,
  maxWords: number = COMMENT_DRAFT_MAX_WORDS
): DraftWordCountResult {
  const words = countWords(text);
  if (words === 0) {
    return { ok: false, words, reason: 'empty' };
  }
  if (words > maxWords) {
    return { ok: false, words, reason: 'too_long' };
  }
  if (words < minWords) {
    return { ok: false, words, reason: 'too_short' };
  }
  return { ok: true, text: text.trim(), words };
}
