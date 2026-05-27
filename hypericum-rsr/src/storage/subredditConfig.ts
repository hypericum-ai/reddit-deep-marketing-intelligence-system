import { redis, settings } from '@devvit/web/server';

import {
  DEFAULT_SUBREDDIT_CONFIG,
  type SubredditConfig,
} from '../types/settings.js';

export { categoryAllowed } from '../types/settings.js';

const configKey = (subreddit: string) =>
  `rsr:config:${subreddit.toLowerCase()}`;

function parseEnabledCategories(raw: unknown): string[] | '*' {
  if (raw === '*' || raw === undefined || raw === null || raw === '') {
    return '*';
  }
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  const text = String(raw).trim();
  if (text === '*') {
    return '*';
  }
  return text
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function clampScore(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clampLength(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(5000, Math.max(0, Math.round(n)));
}

export async function loadSubredditConfig(
  subreddit: string
): Promise<SubredditConfig> {
  const fromRedis = await redis.get(configKey(subreddit));
  let base: SubredditConfig = { ...DEFAULT_SUBREDDIT_CONFIG };

  if (fromRedis) {
    base = { ...base, ...(JSON.parse(fromRedis) as SubredditConfig) };
  }

  try {
    const appSettings = await settings.getAll<Record<string, unknown>>();
    if (appSettings.minIntentScore !== undefined) {
      base.minIntentScore = clampScore(
        appSettings.minIntentScore,
        base.minIntentScore
      );
    }
    if (appSettings.minTextLength !== undefined) {
      base.minTextLength = clampLength(
        appSettings.minTextLength,
        base.minTextLength
      );
    }
    if (appSettings.enabledCategories !== undefined) {
      base.enabledCategories = parseEnabledCategories(
        appSettings.enabledCategories
      );
    }
  } catch {
    // Settings plugin may be unavailable in some contexts.
  }

  return base;
}

export async function initSubredditConfigOnInstall(
  subreddit: string
): Promise<void> {
  const key = configKey(subreddit);
  const existing = await redis.get(key);
  if (existing) {
    return;
  }
  await redis.set(key, JSON.stringify(DEFAULT_SUBREDDIT_CONFIG));
}

export async function updateSubredditConfig(
  subreddit: string,
  partial: Partial<SubredditConfig>
): Promise<SubredditConfig> {
  const current = await loadSubredditConfig(subreddit);
  const next: SubredditConfig = { ...current, ...partial };
  await redis.set(configKey(subreddit), JSON.stringify(next));
  return next;
}
