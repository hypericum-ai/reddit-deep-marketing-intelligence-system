import { redis } from '@devvit/web/server';

import type { Signal } from '../types/signal.js';

const SIGNAL_TTL_SEC = 60 * 60 * 24 * 90;
const RECENT_INDEX = 'rsr:signals:recent';
const MAX_LIST = 500;

const signalKey = (contentId: string) => `rsr:signal:${contentId}`;
const subredditIndexKey = (subreddit: string) =>
  `rsr:signals:sub:${subreddit.toLowerCase()}`;

export async function signalExists(contentId: string): Promise<boolean> {
  const count = await redis.exists(signalKey(contentId));
  return count > 0;
}

export async function getSignal(
  contentId: string
): Promise<Signal | undefined> {
  const raw = await redis.get(signalKey(contentId));
  if (!raw) {
    return undefined;
  }
  return JSON.parse(raw) as Signal;
}

export type SaveSignalOptions = {
  /** When true, overwrite an existing record (post/comment edits). */
  allowUpdate?: boolean;
};

export type SaveSignalResult =
  | { saved: true; signal: Signal }
  | { saved: false; reason: 'duplicate' | 'skipped' };

export async function saveSignal(
  signal: Signal,
  options: SaveSignalOptions = {}
): Promise<SaveSignalResult> {
  const key = signalKey(signal.contentId);
  const exists = await signalExists(signal.contentId);

  if (exists && !options.allowUpdate) {
    return { saved: false, reason: 'duplicate' };
  }

  const payload = JSON.stringify(signal);
  await redis.set(key, payload, { expiration: new Date(Date.now() + SIGNAL_TTL_SEC * 1000) });

  const score = signal.updatedAt;
  await redis.zAdd(RECENT_INDEX, { member: signal.contentId, score });
  await redis.zAdd(subredditIndexKey(signal.subreddit), {
    member: signal.contentId,
    score,
  });

  return { saved: true, signal };
}

export type ListSignalsOptions = {
  subreddit?: string | undefined;
  limit?: number | undefined;
};

export async function listSignals(
  options: ListSignalsOptions = {}
): Promise<Signal[]> {
  const limit = Math.min(options.limit ?? 100, MAX_LIST);
  const indexKey = options.subreddit
    ? subredditIndexKey(options.subreddit)
    : RECENT_INDEX;

  const members = await redis.zRange(indexKey, 0, limit - 1, {
    reverse: true,
    by: 'rank',
  });

  if (members.length === 0) {
    return [];
  }

  const ids = members.map((m) => m.member);
  const keys = ids.map((id) => signalKey(id));
  const rawValues = await redis.mGet(keys);

  const signals: Signal[] = [];
  for (const raw of rawValues) {
    if (raw) {
      signals.push(JSON.parse(raw) as Signal);
    }
  }

  return signals;
}

export async function deleteSignal(
  contentId: string,
  subreddit?: string
): Promise<void> {
  await redis.del(signalKey(contentId));
  await redis.zRem(RECENT_INDEX, [contentId]);
  if (subreddit) {
    await redis.zRem(subredditIndexKey(subreddit), [contentId]);
  }
}

export async function clearSignalIndexes(subreddits: string[]): Promise<void> {
  await redis.del(RECENT_INDEX);
  for (const subreddit of subreddits) {
    await redis.del(subredditIndexKey(subreddit));
  }
}
