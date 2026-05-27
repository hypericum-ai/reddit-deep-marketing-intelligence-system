import { describe, expect, it } from 'vitest';

import {
  countWords,
  truncateToWordCount,
  validateDraftWordCount,
} from './draftWordCount.js';

describe('draftWordCount', () => {
  it('counts words', () => {
    expect(countWords('one two three')).toBe(3);
  });

  it('validates within range', () => {
    const words = Array.from({ length: 75 }, (_, i) => `w${i}`).join(' ');
    const result = validateDraftWordCount(words, 60, 100);
    expect(result.ok).toBe(true);
  });

  it('rejects drafts over max words', () => {
    const words = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ');
    const result = validateDraftWordCount(words, 60, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too_long');
    }
  });

  it('truncates to max words', () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const truncated = truncateToWordCount(words, 100);
    expect(countWords(truncated)).toBe(100);
    expect(truncated.endsWith('…')).toBe(true);
  });
});
