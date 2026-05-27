import { describe, expect, it } from 'vitest';

import { preprocessText } from './preprocess.js';

describe('preprocessText', () => {
  it('strips markdown and urls', () => {
    const result = preprocessText(
      'Check [link](https://example.com) and `code` block',
      10
    );
    expect(result.cleanText).not.toContain('http');
    expect(result.cleanText).toContain('link');
  });

  it('flags spam phrases', () => {
    const result = preprocessText('click here for free money now', 5);
    expect(result.isSpam).toBe(true);
  });

  it('flags short content', () => {
    const result = preprocessText('too short', 40);
    expect(result.tooShort).toBe(true);
  });
});
