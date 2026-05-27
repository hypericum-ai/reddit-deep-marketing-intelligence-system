import { describe, expect, it } from 'vitest';

import { normalizeHypericumDomain } from '../types/hypericumDomain.js';

describe('normalizeHypericumDomain', () => {
  it('accepts known slugs', () => {
    expect(normalizeHypericumDomain('ai-production-failure')).toBe(
      'ai-production-failure'
    );
    expect(normalizeHypericumDomain(' regulatory-audit ')).toBe('regulatory-audit');
  });

  it('falls back to n/a for unknown values', () => {
    expect(normalizeHypericumDomain('something-else')).toBe('n/a');
    expect(normalizeHypericumDomain('')).toBe('n/a');
  });
});
