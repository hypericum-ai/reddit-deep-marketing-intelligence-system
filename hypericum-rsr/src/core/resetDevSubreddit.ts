import { reddit } from '@devvit/web/server';

import { purgeAllQueueData, type PurgeAllQueueResult } from './purgeAllQueueData.js';

/** Playtest subreddit from devvit.json — reset is blocked elsewhere. */
export const DEV_RESET_SUBREDDIT = 'hypericum_rsr_dev';

export const RSR_DASHBOARD_POST_TITLE = 'RSR Review Dashboard';

export type ResetDevSubredditResult = PurgeAllQueueResult & {
  subredditName: string;
  scannedPosts: number;
  removedPosts: number;
  skippedPosts: number;
  removeErrors: number;
};

function shouldRemovePost(
  post: { title?: string; authorName?: string },
  username: string | undefined
): boolean {
  if (post.title === RSR_DASHBOARD_POST_TITLE) {
    return true;
  }

  if (!username || !post.authorName) {
    return false;
  }

  return post.authorName.toLowerCase() === username.toLowerCase();
}

async function listSubredditPosts(subredditName: string) {
  const [newPosts, hotPosts] = await Promise.all([
    reddit.getNewPosts({ subredditName, limit: 100 }).all(),
    reddit.getHotPosts({ subredditName, limit: 100 }).all(),
  ]);

  const byId = new Map<string, (typeof newPosts)[number]>();
  for (const post of [...newPosts, ...hotPosts]) {
    byId.set(post.id, post);
  }

  return [...byId.values()];
}

export async function resetDevSubreddit(
  subredditName: string
): Promise<ResetDevSubredditResult> {
  const normalized = subredditName.toLowerCase();
  if (normalized !== DEV_RESET_SUBREDDIT) {
    throw new Error(
      `Dev reset is only allowed on r/${DEV_RESET_SUBREDDIT} (got r/${subredditName})`
    );
  }

  const username = await reddit.getCurrentUsername();
  const posts = await listSubredditPosts(subredditName);

  let removedPosts = 0;
  let skippedPosts = 0;
  let removeErrors = 0;

  for (const post of posts) {
    if (!shouldRemovePost(post, username)) {
      skippedPosts += 1;
      continue;
    }

    try {
      await reddit.remove(post.id, false);
      removedPosts += 1;
      console.log(
        `RSR reset: removed ${post.id}  author=${post.authorName ?? 'unknown'}  title="${post.title ?? ''}"`
      );
    } catch (err) {
      removeErrors += 1;
      console.error(`RSR reset: failed to remove ${post.id}`, err);
    }
  }

  const queue = await purgeAllQueueData();

  console.log(
    `RSR reset complete: r/${subredditName}  removedPosts=${removedPosts}  ` +
      `queueSignals=${queue.deletedSignals}  drafts=${queue.deletedDrafts}  insights=${queue.deletedInsights}`
  );

  return {
    subredditName,
    scannedPosts: posts.length,
    removedPosts,
    skippedPosts,
    removeErrors,
    ...queue,
  };
}
