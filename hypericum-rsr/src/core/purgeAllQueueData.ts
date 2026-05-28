import { deleteDraft, getDrafts } from '../storage/commentDraftStore.js';
import { deleteEmbedding } from '../storage/embeddingStore.js';
import {
  clearEngagementRecord,
  clearPendingEngagementIndex,
  getEngagements,
} from '../storage/engagementStore.js';
import { deleteInsight, getInsights } from '../storage/insightStore.js';
import {
  clearSignalIndexes,
  deleteSignal,
  listSignals,
} from '../storage/redisSignalStore.js';

export type PurgeAllQueueResult = {
  deletedSignals: number;
  deletedDrafts: number;
  deletedInsights: number;
  deletedEmbeddings: number;
  deletedEngagements: number;
};

export async function purgeAllQueueData(): Promise<PurgeAllQueueResult> {
  const totals: PurgeAllQueueResult = {
    deletedSignals: 0,
    deletedDrafts: 0,
    deletedInsights: 0,
    deletedEmbeddings: 0,
    deletedEngagements: 0,
  };

  const clearedSubreddits = new Set<string>();

  while (true) {
    const signals = await listSignals({ limit: 500 });
    if (signals.length === 0) {
      break;
    }

    const contentIds = signals.map((signal) => signal.contentId);
    for (const signal of signals) {
      clearedSubreddits.add(signal.subreddit);
    }

    const [draftMap, insightMap, engagementMap] = await Promise.all([
      getDrafts(contentIds),
      getInsights(contentIds),
      getEngagements(contentIds),
    ]);

    for (const signal of signals) {
      const contentId = signal.contentId;
      await deleteSignal(contentId, signal.subreddit);
      await deleteEmbedding(contentId);
      totals.deletedSignals += 1;
      totals.deletedEmbeddings += 1;

      if (draftMap.has(contentId)) {
        await deleteDraft(contentId);
        totals.deletedDrafts += 1;
      }

      if (insightMap.has(contentId)) {
        await deleteInsight(contentId);
        totals.deletedInsights += 1;
      }

      if (engagementMap.has(contentId)) {
        await clearEngagementRecord(contentId);
        totals.deletedEngagements += 1;
      }
    }
  }

  await clearSignalIndexes([...clearedSubreddits]);
  await clearPendingEngagementIndex();

  return totals;
}
