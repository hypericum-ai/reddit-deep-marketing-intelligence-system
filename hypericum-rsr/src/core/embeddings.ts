const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
const EMBEDDING_DIMENSIONS = 768;
const TIMEOUT_MS = 20_000;

type GeminiEmbeddingResponse = {
  embedding?: { values?: number[] };
  error?: { message?: string };
};

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function computeEmbedding(
  text: string,
  apiKey: string
): Promise<number[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${EMBEDDING_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: EMBEDDING_DIMENSIONS,
        content: { parts: [{ text: text.slice(0, 2048) }] },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const json = (await res.json()) as GeminiEmbeddingResponse;
  if (!res.ok) {
    throw new Error(
      `Gemini embedding error ${res.status}: ${json.error?.message ?? 'unknown'}`
    );
  }

  const values = json.embedding?.values;
  if (!values || values.length === 0) {
    throw new Error('Gemini returned empty embedding');
  }

  return values;
}
