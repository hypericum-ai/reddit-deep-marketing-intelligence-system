import { reddit } from '@devvit/web/server';

import { processContentEvent } from './processContentEvent.js';
import type { ContentEventInput } from './processContentEvent.js';
import { maybeExtractInsightAndDraft } from '../routes/triggerPipeline.js';
import {
  loadMonitorSettings,
  postMatchesMonitorKeywords,
} from '../server/monitorSettings.js';
import { redis } from '@devvit/web/server';

const SEEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const seenKey = (postId: string) => `rsr:monitor:seen:${postId}`;

type FetchedPost = {
  id: string;
  title?: string | undefined;
  body?: string | undefined;
  subredditName: string;
  authorName?: string | undefined;
  createdAt?: Date | undefined;
  score?: number | undefined;
  numberOfComments?: number | undefined;
  permalink?: string | undefined;
};

function mapFetchedPost(post: FetchedPost): ContentEventInput {
  const text = [post.title, post.body].filter(Boolean).join('\n');
  return {
    contentId: post.id,
    contentType: 'post',
    eventType: 'submit',
    subreddit: post.subredditName,
    author: post.authorName ?? 'unknown',
    text,
    createdAt: post.createdAt?.getTime?.() ?? Date.now(),
    engagement: {
      score: post.score ?? 0,
      ...(post.numberOfComments !== undefined
        ? { numComments: post.numberOfComments }
        : {}),
    },
    ...(post.title ? { title: post.title } : {}),
    ...(post.permalink ? { permalink: post.permalink } : {}),
  };
}

export type MonitorRunResult = {
  scannedSubreddits: string[];
  fetched: number;
  processed: number;
  saved: number;
  skippedSeen: number;
  skippedKeyword: number;
};

export async function runProactiveSubredditMonitor(options?: {
  subreddits?: string[];
  limitPerSub?: number;
}): Promise<MonitorRunResult> {
  const settings = await loadMonitorSettings();
  const subreddits =
    options?.subreddits && options.subreddits.length > 0
      ? options.subreddits
      : settings.monitorSubreddits;

  const result: MonitorRunResult = {
    scannedSubreddits: subreddits,
    fetched: 0,
    processed: 0,
    saved: 0,
    skippedSeen: 0,
    skippedKeyword: 0,
  };

  if (subreddits.length === 0) {
    return result;
  }

  const limitPerSub = options?.limitPerSub ?? 25;

  for (const subredditName of subreddits) {
    const posts = await reddit
      .getNewPosts({ subredditName, limit: limitPerSub })
      .all();

    result.fetched += posts.length;

    for (const post of posts) {
      if (await redis.get(seenKey(post.id))) {
        result.skippedSeen += 1;
        continue;
      }

      const mapped = mapFetchedPost(post);
      if (!postMatchesMonitorKeywords(mapped.text, settings.monitorKeywords)) {
        result.skippedKeyword += 1;
        await redis.set(seenKey(post.id), 'skip-keyword', {
          expiration: new Date(Date.now() + SEEN_TTL_MS),
        });
        continue;
      }

      result.processed += 1;
      const processed = await processContentEvent(mapped);
      await redis.set(seenKey(post.id), processed.status, {
        expiration: new Date(Date.now() + SEEN_TTL_MS),
      });

      if (processed.status === 'saved') {
        result.saved += 1;
        void maybeExtractInsightAndDraft(processed.signal);
      }
    }
  }

  return result;
}
