import type { HypericumDomainSlug } from './hypericumDomain.js';

export type EmotionalTone =
  | 'frustrated'
  | 'annoyed'
  | 'curious'
  | 'desperate'
  | 'hopeful'
  | 'neutral';

export type UrgencyLevel = 'high' | 'medium' | 'low';

export type LLMInsight = {
  contentId: string;
  extractedAt: number;
  model: string;
  painPoint: string;
  userContext: string;
  currentWorkaround: string;
  desiredSolution: string;
  emotionalTone: EmotionalTone;
  urgency: UrgencyLevel;
  marketingHook: string;
  hypericumDomain: HypericumDomainSlug;
};
