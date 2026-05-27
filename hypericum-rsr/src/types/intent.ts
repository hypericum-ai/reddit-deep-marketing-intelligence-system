export type IntentType =
  | 'frustration'
  | 'switching'
  | 'discovery'
  | 'complaint'
  | 'general';

export type IntentLevel = 'low' | 'medium' | 'high';

export type IntentResult = {
  score: number;
  level: IntentLevel;
  intentType: IntentType;
  matchedSignals: string[];
};
