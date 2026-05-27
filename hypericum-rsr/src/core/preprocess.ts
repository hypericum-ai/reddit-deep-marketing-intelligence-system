import intentRules from '../config/intentRules.json';

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'my',
  'your',
  'our',
]);

export type PreprocessResult = {
  cleanText: string;
  tokenCount: number;
  isSpam: boolean;
  tooShort: boolean;
};

export function preprocessText(
  text: string,
  minTextLength = 0
): PreprocessResult {
  const cleanText = text
    .replace(/http\S+/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const tokens = cleanText
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

  const tokenCount = tokens.length;
  const isSpam = intentRules.spamPhrases.some((phrase) =>
    cleanText.includes(phrase)
  );
  const tooShort =
    cleanText.length < minTextLength ||
    tokenCount < intentRules.minTokenCount;

  return {
    cleanText,
    tokenCount,
    isSpam,
    tooShort,
  };
}

export function extractSignificantTokens(cleanText: string, max = 3): string[] {
  return cleanText
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
    .slice(0, max);
}
