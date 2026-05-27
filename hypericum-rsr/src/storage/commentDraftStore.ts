import { redis } from '@devvit/web/server';
import type { CommentDraft } from '../types/commentDraft.js';

const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 90;

const draftKey = (contentId: string) => `rsr:draft:${contentId}`;

export async function draftExists(contentId: string): Promise<boolean> {
  return (await redis.exists(draftKey(contentId))) > 0;
}

export async function saveDraft(draft: CommentDraft): Promise<void> {
  await redis.set(
    draftKey(draft.contentId),
    JSON.stringify(draft),
    { expiration: new Date(Date.now() + DRAFT_TTL_MS) }
  );
}

export async function getDraft(
  contentId: string
): Promise<CommentDraft | undefined> {
  const raw = await redis.get(draftKey(contentId));
  if (!raw) return undefined;
  return JSON.parse(raw) as CommentDraft;
}

export async function deleteDraft(contentId: string): Promise<void> {
  await redis.del(draftKey(contentId));
}

export async function getDrafts(
  contentIds: string[]
): Promise<Map<string, CommentDraft>> {
  if (contentIds.length === 0) return new Map();
  const keys = contentIds.map((id) => draftKey(id));
  const values = await redis.mGet(keys);
  const map = new Map<string, CommentDraft>();
  for (let i = 0; i < contentIds.length; i++) {
    const raw = values[i];
    const id = contentIds[i];
    if (raw && id) {
      map.set(id, JSON.parse(raw) as CommentDraft);
    }
  }
  return map;
}
