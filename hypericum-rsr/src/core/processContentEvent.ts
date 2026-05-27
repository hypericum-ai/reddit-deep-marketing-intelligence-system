import { assignClusters } from './clustering.js';
import { preprocessText } from './preprocess.js';
import { scoreIntent } from './intentScoring.js';
import {
  buildHeuristicSimilarity,
  filterSimilarityCandidates,
} from './similarity.js';
import {
  saveSignal,
  signalExists,
  listSignals,
  type SaveSignalResult,
} from '../storage/redisSignalStore.js';
import { getDrafts } from '../storage/commentDraftStore.js';
import { loadSubredditConfig } from '../storage/subredditConfig.js';

import type { ContentType, Signal } from '../types/signal.js';

export type ContentEventInput = {
  contentId: string;
  contentType: ContentType;
  eventType: 'submit' | 'update';
  subreddit: string;
  author: string;
  title?: string | undefined;
  text: string;
  createdAt: number;
  engagement: {
    score: number;
    numComments?: number | undefined;
  };
  permalink?: string | undefined;
};

export type ProcessResult =
  | { status: 'ignored'; reason: string }
  | { status: 'duplicate' }
  | { status: 'saved'; signal: Signal; save: SaveSignalResult };

export async function processContentEvent(
  input: ContentEventInput
): Promise<ProcessResult> {
  const config = await loadSubredditConfig(input.subreddit);
  const preprocessed = preprocessText(input.text, config.minTextLength);

  if (preprocessed.isSpam) {
    return { status: 'ignored', reason: 'spam' };
  }
  if (preprocessed.tooShort) {
    return { status: 'ignored', reason: 'too_short' };
  }

  const intent = scoreIntent(preprocessed.cleanText);
  if (intent.score < config.minIntentScore) {
    return { status: 'ignored', reason: 'low_intent' };
  }

  const clusters = assignClusters(preprocessed.cleanText, intent);
  const now = Date.now();

  const existingSignals = await listSignals({
    subreddit: input.subreddit,
    limit: 100,
  });
  const candidates = filterSimilarityCandidates(
    input.contentId,
    existingSignals,
    now
  );
  const draftMap = await getDrafts(candidates.map((s) => s.contentId));

  const signal: Signal = {
    contentId: input.contentId,
    contentType: input.contentType,
    subreddit: input.subreddit,
    author: input.author,
    text: input.text.trim(),
    cleanText: preprocessed.cleanText,
    intent,
    clusters,
    createdAt: input.createdAt,
    updatedAt: now,
    engagement: input.engagement,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.permalink !== undefined ? { permalink: input.permalink } : {}),
  };

  const similarity = buildHeuristicSimilarity(signal, candidates, draftMap);
  signal.similarity = similarity;
  signal.status = similarity.redirectRecommended ? 'redirected' : 'active';

  const allowUpdate = input.eventType === 'update';
  if (!allowUpdate && (await signalExists(input.contentId))) {
    return { status: 'duplicate' };
  }

  const save = await saveSignal(signal, { allowUpdate });
  if (!save.saved) {
    return { status: 'duplicate' };
  }

  return { status: 'saved', signal, save };
}
