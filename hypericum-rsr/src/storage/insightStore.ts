import { redis } from '@devvit/web/server';
import type { LLMInsight } from '../types/insight.js';
import { normalizeHypericumDomain } from '../types/hypericumDomain.js';

const INSIGHT_TTL_MS = 1000 * 60 * 60 * 24 * 90;

const insightKey = (contentId: string) => `rsr:insight:${contentId}`;

function parseStoredInsight(raw: string): LLMInsight {
  const parsed = JSON.parse(raw) as LLMInsight & { hypericumDomain?: string };
  return {
    ...parsed,
    hypericumDomain: normalizeHypericumDomain(parsed.hypericumDomain ?? 'n/a'),
  };
}

export async function insightExists(contentId: string): Promise<boolean> {
  return (await redis.exists(insightKey(contentId))) > 0;
}

export async function saveInsight(insight: LLMInsight): Promise<void> {
  await redis.set(
    insightKey(insight.contentId),
    JSON.stringify(insight),
    { expiration: new Date(Date.now() + INSIGHT_TTL_MS) }
  );
}

export async function getInsight(
  contentId: string
): Promise<LLMInsight | undefined> {
  const raw = await redis.get(insightKey(contentId));
  if (!raw) return undefined;
  return parseStoredInsight(raw);
}

export async function getInsights(
  contentIds: string[]
): Promise<Map<string, LLMInsight>> {
  if (contentIds.length === 0) return new Map();
  const keys = contentIds.map((id) => insightKey(id));
  const values = await redis.mGet(keys);
  const map = new Map<string, LLMInsight>();
  for (let i = 0; i < contentIds.length; i++) {
    const raw = values[i];
    const id = contentIds[i];
    if (raw && id) {
      map.set(id, parseStoredInsight(raw));
    }
  }
  return map;
}

export async function deleteInsight(contentId: string): Promise<void> {
  await redis.del(insightKey(contentId));
}
