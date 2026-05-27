import type { IntentResult } from './intent.js';
import type { SimilarityResult } from './similarity.js';

export type ContentType = 'post' | 'comment';

export type SignalStatus = 'active' | 'redirected';

export type Signal = {
  contentId: string;
  contentType: ContentType;
  subreddit: string;
  author: string;
  title?: string | undefined;
  text: string;
  cleanText: string;
  intent: IntentResult;
  clusters: string[];
  createdAt: number;
  updatedAt: number;
  engagement: {
    score: number;
    numComments?: number | undefined;
  };
  permalink?: string | undefined;
  status?: SignalStatus | undefined;
  similarity?: SimilarityResult | undefined;
};

export type AggregatedCluster = {
  category: string;
  signals: Signal[];
  frequency: number;
  avgIntent: number;
  avgEngagement: number;
  recentCount24h: number;
  trendVelocity: number;
};

export type RankedOpportunity = {
  category: string;
  frequency: number;
  avgIntent: number;
  avgEngagement: number;
  trendVelocity: number;
  urgency: number;
  opportunityScore: number;
};
