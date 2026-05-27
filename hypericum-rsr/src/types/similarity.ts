export type SimilarMatchMethod = 'heuristic' | 'semantic' | 'combined';

export type SimilarMatch = {
  contentId: string;
  permalink?: string | undefined;
  title?: string | undefined;
  similarityScore: number;
  matchReason: string;
  matchMethod: SimilarMatchMethod;
  engagement: {
    score: number;
    numComments?: number | undefined;
  };
  hasExistingDraft: boolean;
};

export type SimilarityStatus = 'unique' | 'similar' | 'redirected';

export type SimilarityResult = {
  similarPosts: SimilarMatch[];
  redirectTo?: SimilarMatch | undefined;
  redirectRecommended: boolean;
  status: SimilarityStatus;
};
