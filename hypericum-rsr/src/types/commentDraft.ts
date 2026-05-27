export type HypericumRelevance =
  | 'direct'       // post describes a problem Hypericum directly solves
  | 'partial'      // post is adjacent — Hypericum is one useful answer among several
  | 'none';        // post is not relevant enough to mention Hypericum

export type CommentDraft = {
  contentId: string;
  draftedAt: number;
  model: string;
  relevance: HypericumRelevance;
  relevanceReason: string;     // one sentence explaining why this relevance level was assigned
  domainMatch: string;         // which Hypericum pain point domain this maps to, or "n/a"
  draft: string;               // the full ready-to-post comment text
  postingGuidance: string;     // brief note on tone, caveats, or suggested edits before posting
};
