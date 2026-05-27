import categoriesConfig from '../config/categories.json';

import { extractSignificantTokens } from './preprocess.js';

import type { IntentResult } from '../types/intent.js';

type CategoryDef = {
  slug: string;
  keywords: string[];
};

const CATEGORIES = categoriesConfig.categories as CategoryDef[];

const INTENT_CLUSTER_MAP: Record<string, string> = {
  frustration: 'frustration-signals',
  switching: 'switching-intent',
  discovery: 'solution-seeking',
  complaint: 'pain-complaints',
  general: 'general',
};

export function assignClusters(
  cleanText: string,
  intent: IntentResult
): string[] {
  const clusters = new Set<string>();

  for (const category of CATEGORIES) {
    if (category.keywords.some((kw) => cleanText.includes(kw))) {
      clusters.add(category.slug);
    }
  }

  if (intent.matchedSignals.length > 0) {
    clusters.add(INTENT_CLUSTER_MAP[intent.intentType] ?? 'general');
  }

  if (clusters.size === 0) {
    const tokens = extractSignificantTokens(cleanText, 3);
    if (tokens.length > 0) {
      clusters.add(`topic:${tokens.join('-')}`);
    } else {
      clusters.add('general');
    }
  }

  return [...clusters];
}
