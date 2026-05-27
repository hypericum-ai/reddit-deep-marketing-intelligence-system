import { describe, expect, it } from 'vitest';

import { postMatchesMonitorKeywords } from './monitorSettings.js';

describe('postMatchesMonitorKeywords', () => {
  it('matches all posts when no keywords configured', () => {
    expect(postMatchesMonitorKeywords('anything about LLMs', [])).toBe(true);
  });

  it('matches when any keyword appears in text', () => {
    const keywords = ['llm', 'classification'];
    expect(
      postMatchesMonitorKeywords('Our LLM pipeline keeps failing', keywords)
    ).toBe(true);
    expect(
      postMatchesMonitorKeywords('Taxonomy drift in prod', keywords)
    ).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(
      postMatchesMonitorKeywords('RAG retrieval issues', ['rag'])
    ).toBe(true);
  });
});
