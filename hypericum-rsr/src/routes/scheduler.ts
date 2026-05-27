import { Hono } from 'hono';

import { runProactiveSubredditMonitor } from '../core/proactiveSearch.js';
import { scanDraftEngagementForSubreddit } from '../core/engagementScan.js';
import { loadMonitorSettings } from '../server/monitorSettings.js';

export const scheduler = new Hono();

scheduler.post('/monitor-subreddits', async (c) => {
  const result = await runProactiveSubredditMonitor();
  console.log(
    `RSR monitor: subs=[${result.scannedSubreddits.join(', ')}]` +
    `  fetched=${result.fetched} saved=${result.saved}` +
    `  skippedSeen=${result.skippedSeen} skippedKeyword=${result.skippedKeyword}`
  );
  return c.json(result);
});

scheduler.post('/check-engagement', async (c) => {
  try {
    const { monitorSubreddits } = await loadMonitorSettings();
    const subreddits = new Set([
      'hypericum_rsr_dev',
      ...monitorSubreddits,
    ]);

    let checkedPosts = 0;
    let checkedThreads = 0;
    let skippedInvalid = 0;
    let matchesFound = 0;

    for (const subreddit of subreddits) {
      const result = await scanDraftEngagementForSubreddit(subreddit);
      checkedPosts += result.checkedPosts;
      checkedThreads += result.checkedThreads;
      skippedInvalid += result.skippedInvalid;
      matchesFound += result.matchesFound;
    }

    console.log(
      `RSR engagement scan: drafts=${checkedPosts} threads=${checkedThreads}` +
      ` matches=${matchesFound} skipped=${skippedInvalid}`
    );
    return c.json({
      checkedPosts,
      checkedThreads,
      skippedInvalid,
      matchesFound,
    });
  } catch (err) {
    console.error('RSR engagement scan failed:', err);
    return c.json(
      {
        checkedPosts: 0,
        checkedThreads: 0,
        skippedInvalid: 0,
        matchesFound: 0,
        error: String(err),
      },
      500
    );
  }
});
