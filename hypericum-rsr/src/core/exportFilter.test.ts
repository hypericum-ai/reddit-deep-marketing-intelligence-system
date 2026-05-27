import { describe, expect, it } from 'vitest';

import { isDraftExportEligible } from './exportFilter.js';
import type { CommentDraft } from '../types/commentDraft.js';

function makeDraft(overrides: Partial<CommentDraft> = {}): CommentDraft {
  return {
    contentId: 't3_test',
    draftedAt: Date.parse('2026-05-27T12:00:00.000Z'),
    model: 'gemini-2.5-flash',
    relevance: 'direct',
    relevanceReason: 'test',
    domainMatch: 'test',
    draft: 'hello world',
    postingGuidance: '',
    ...overrides,
  };
}

describe('isDraftExportEligible', () => {
  it('excludes relevance=none drafts', () => {
    expect(
      isDraftExportEligible(makeDraft({ relevance: 'none' }), 0)
    ).toBe(false);
  });

  it('excludes drafts before minDraftedAt', () => {
    expect(
      isDraftExportEligible(
        makeDraft({ draftedAt: Date.parse('2026-05-01T00:00:00.000Z') }),
        Date.parse('2026-05-27T00:00:00.000Z')
      )
    ).toBe(false);
  });

  it('includes direct drafts after minDraftedAt', () => {
    expect(
      isDraftExportEligible(
        makeDraft(),
        Date.parse('2026-05-27T00:00:00.000Z')
      )
    ).toBe(true);
  });
});
