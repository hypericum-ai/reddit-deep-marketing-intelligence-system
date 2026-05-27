import { redis } from '@devvit/web/server';

const EMBEDDING_TTL_MS = 1000 * 60 * 60 * 24 * 90;

const embeddingKey = (contentId: string) => `rsr:embedding:${contentId}`;

export async function saveEmbedding(
  contentId: string,
  vector: number[]
): Promise<void> {
  await redis.set(
    embeddingKey(contentId),
    JSON.stringify(vector),
    { expiration: new Date(Date.now() + EMBEDDING_TTL_MS) }
  );
}

export async function getEmbedding(
  contentId: string
): Promise<number[] | undefined> {
  const raw = await redis.get(embeddingKey(contentId));
  if (!raw) {
    return undefined;
  }
  return JSON.parse(raw) as number[];
}

export async function getEmbeddings(
  contentIds: string[]
): Promise<Map<string, number[]>> {
  if (contentIds.length === 0) {
    return new Map();
  }

  const keys = contentIds.map((id) => embeddingKey(id));
  const values = await redis.mGet(keys);
  const map = new Map<string, number[]>();

  for (let i = 0; i < contentIds.length; i++) {
    const raw = values[i];
    const id = contentIds[i];
    if (raw && id) {
      map.set(id, JSON.parse(raw) as number[]);
    }
  }

  return map;
}
