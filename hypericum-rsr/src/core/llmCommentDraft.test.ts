import { describe, expect, it } from 'vitest';

import {
  sanitizeDraftText,
  sanitizePostingGuidance,
} from './llmCommentDraft.js';

describe('sanitizePostingGuidance', () => {
  it('drops instruction leaks', () => {
    expect(
      sanitizePostingGuidance(
        'Maintain a helpful, practitioner-focused tone. Do not use sales language.'
      )
    ).toBe('');
  });

  it('keeps short reviewer notes', () => {
    expect(sanitizePostingGuidance('Shorten paragraph 3 before posting.')).toBe(
      'Shorten paragraph 3 before posting.'
    );
  });

  it('drops meta reviewer instruction leaks', () => {
    expect(
      sanitizePostingGuidance(
        'The draft focuses on general advice without mentioning Hypericum.'
      )
    ).toBe('');
    expect(
      sanitizePostingGuidance('Ensure the tone remains helpful and diagnostic, not salesy.')
    ).toBe('');
  });
});

describe('sanitizeDraftText', () => {
  it('removes trailing instruction paragraphs from draft body', () => {
    const raw =
      'We saw the same taxonomy drift in prod.\n\n' +
      'Maintain a helpful, practitioner-focused tone and avoid sales language.';
    expect(sanitizeDraftText(raw)).toBe('We saw the same taxonomy drift in prod.');
  });
});
