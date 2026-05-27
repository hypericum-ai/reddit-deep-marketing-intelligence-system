import { settings } from '@devvit/web/server';

import { DEFAULT_MONITOR_SUBREDDITS } from '../generated/llmPrompts.js';

export type MonitorSettings = {
  monitorSubreddits: string[];
  monitorKeywords: string[];
};

function parseCsv(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === '') {
    return [];
  }
  return String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSubredditNames(names: string[]): string[] {
  return names.map((name) => name.replace(/^r\//i, '').toLowerCase());
}

export async function loadMonitorSettings(): Promise<MonitorSettings> {
  try {
    const appSettings = await settings.getAll<Record<string, unknown>>();
    const configured = normalizeSubredditNames(parseCsv(appSettings.monitorSubreddits));
    const monitorSubreddits =
      configured.length > 0
        ? configured
        : normalizeSubredditNames([...DEFAULT_MONITOR_SUBREDDITS]);

    return {
      monitorSubreddits,
      monitorKeywords: parseCsv(appSettings.monitorKeywords).map((word) =>
        word.toLowerCase()
      ),
    };
  } catch {
    return {
      monitorSubreddits: normalizeSubredditNames([...DEFAULT_MONITOR_SUBREDDITS]),
      monitorKeywords: [],
    };
  }
}

export function postMatchesMonitorKeywords(
  text: string,
  keywords: string[]
): boolean {
  if (keywords.length === 0) {
    return true;
  }
  const haystack = text.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}
