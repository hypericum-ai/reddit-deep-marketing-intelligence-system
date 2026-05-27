import intentRules from '../config/intentRules.json';

import type { IntentLevel, IntentResult, IntentType } from '../types/intent.js';

type Rule = {
  phrase: string;
  points: number;
  intentType: IntentType;
};

const RULES = intentRules.rules as Rule[];

function resolveLevel(score: number): IntentLevel {
  if (score >= 70) {
    return 'high';
  }
  if (score >= 40) {
    return 'medium';
  }
  return 'low';
}

export function scoreIntent(cleanText: string): IntentResult {
  let score = 0;
  const matchedSignals: string[] = [];
  let topType: IntentType = 'general';
  let topTypePoints = 0;

  for (const rule of RULES) {
    if (!cleanText.includes(rule.phrase)) {
      continue;
    }
    score += rule.points;
    matchedSignals.push(rule.phrase);
    if (rule.points > topTypePoints) {
      topTypePoints = rule.points;
      topType = rule.intentType;
    }
  }

  return {
    score: Math.min(score, 100),
    level: resolveLevel(Math.min(score, 100)),
    intentType: matchedSignals.length > 0 ? topType : 'general',
    matchedSignals,
  };
}
