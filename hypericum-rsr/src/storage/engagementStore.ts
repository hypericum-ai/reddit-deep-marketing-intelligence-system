import { redis } from '@devvit/web/server';

import type { DraftEngagement } from '../types/engagement.js';

const ENGAGEMENT_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const PENDING_INDEX = 'rsr:engagement:pending';

const engagementKey = (contentId: string) => `rsr:engagement:${contentId}`;

export async function saveEngagement(
  engagement: DraftEngagement
): Promise<void> {
  await redis.set(
    engagementKey(engagement.signalContentId),
    JSON.stringify(engagement),
    { expiration: new Date(Date.now() + ENGAGEMENT_TTL_MS) }
  );

  if (engagement.status === 'pending') {
    await redis.zAdd(PENDING_INDEX, {
      member: engagement.signalContentId,
      score: engagement.lastCheckedAt,
    });
  } else {
    await redis.zRem(PENDING_INDEX, [engagement.signalContentId]);
  }
}

export async function getEngagement(
  contentId: string
): Promise<DraftEngagement | undefined> {
  const raw = await redis.get(engagementKey(contentId));
  if (!raw) {
    return undefined;
  }
  return JSON.parse(raw) as DraftEngagement;
}

export async function getEngagements(
  contentIds: string[]
): Promise<Map<string, DraftEngagement>> {
  if (contentIds.length === 0) {
    return new Map();
  }

  const keys = contentIds.map((id) => engagementKey(id));
  const values = await redis.mGet(keys);
  const map = new Map<string, DraftEngagement>();

  contentIds.forEach((id, index) => {
    const raw = values[index];
    if (raw) {
      map.set(id, JSON.parse(raw) as DraftEngagement);
    }
  });

  return map;
}

export async function listPendingEngagementIds(
  limit = 50
): Promise<string[]> {
  const rows = await redis.zRange(PENDING_INDEX, 0, limit - 1, {
    reverse: true,
    by: 'rank',
  });
  return rows.map((row) => row.member);
}

export async function clearEngagementRecord(contentId: string): Promise<void> {
  await redis.del(engagementKey(contentId));
  await redis.zRem(PENDING_INDEX, [contentId]);
}
