import { Hono } from 'hono';

import { aggregateSignals } from '../core/aggregateSignals.js';
import { rankOpportunities } from '../core/rankOpportunities.js';
import { buildReviewerQueue } from '../core/reviewerQueue.js';
import { getDrafts } from '../storage/commentDraftStore.js';
import { getEngagements } from '../storage/engagementStore.js';
import { getInsights } from '../storage/insightStore.js';
import { listSignals } from '../storage/redisSignalStore.js';
import {
  sanitizeDraftText,
  sanitizePostingGuidance,
} from '../core/llmCommentDraft.js';
import {
  listSignalsForQueue,
  loadReviewerQueueForSubreddit,
  queueContentIds,
} from '../server/loadReviewerQueue.js';
import { loadSubredditConfig } from '../storage/subredditConfig.js';
import { renderDashboardPage } from './dashboardPage.js';

export const api = new Hono();

function parseLimit(raw: string | undefined): number {
  const n = Number(raw ?? '100');
  if (!Number.isFinite(n) || n < 1) {
    return 100;
  }
  return Math.min(500, Math.round(n));
}

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) {
    return defaultValue;
  }
  return raw === 'true' || raw === '1';
}

async function loadSignalBundle(subreddit: string | undefined, limit: number) {
  const signals = subreddit
    ? (await listSignalsForQueue(subreddit)).slice(0, limit)
    : await listSignals({ limit });
  const contentIds = queueContentIds(signals);
  const [draftMapRaw, insightMap, engagementMap] = await Promise.all([
    getDrafts(contentIds),
    getInsights(contentIds),
    getEngagements(contentIds),
  ]);
  const draftMap = new Map(
    [...draftMapRaw.entries()].map(([id, draft]) => [
      id,
      {
        ...draft,
        draft: sanitizeDraftText(draft.draft),
        postingGuidance: sanitizePostingGuidance(draft.postingGuidance),
      },
    ])
  );
  return { signals, draftMap, insightMap, engagementMap };
}

api.get('/signals', async (c) => {
  const subreddit = c.req.query('subreddit');
  const limit = parseLimit(c.req.query('limit'));
  const signals = await listSignals({
    ...(subreddit ? { subreddit } : {}),
    limit,
  });

  return c.json({
    total: signals.length,
    subreddit: subreddit ?? null,
    signals,
  });
});

api.get('/aggregated-signals', async (c) => {
  const subreddit = c.req.query('subreddit');
  const limit = parseLimit(c.req.query('limit'));
  const signals = await listSignals({
    ...(subreddit ? { subreddit } : {}),
    limit,
  });
  const config = subreddit
    ? await loadSubredditConfig(subreddit)
    : undefined;
  const aggregated = aggregateSignals(signals, config);

  return c.json({
    subreddit: subreddit ?? null,
    clusters: aggregated,
  });
});

api.get('/ranked-opportunities', async (c) => {
  const subreddit = c.req.query('subreddit');
  const limit = parseLimit(c.req.query('limit'));
  const signals = await listSignals({
    ...(subreddit ? { subreddit } : {}),
    limit,
  });
  const config = subreddit
    ? await loadSubredditConfig(subreddit)
    : undefined;
  const aggregated = aggregateSignals(signals, config);
  const ranked = rankOpportunities(aggregated);

  return c.json({
    subreddit: subreddit ?? null,
    opportunities: ranked,
  });
});

api.get('/config', async (c) => {
  const subreddit = c.req.query('subreddit');
  if (!subreddit) {
    return c.json({ error: 'subreddit query param required' }, 400);
  }
  const config = await loadSubredditConfig(subreddit);
  return c.json({ subreddit, config });
});

api.get('/comment-drafts', async (c) => {
  const subreddit = c.req.query('subreddit');
  const relevanceFilter = c.req.query('relevance');
  const excludeRedirected = parseBoolean(c.req.query('excludeRedirected'), false);
  const limit = parseLimit(c.req.query('limit'));

  const { signals, draftMap, insightMap, engagementMap } = await loadSignalBundle(
    subreddit,
    limit
  );

  const queue = buildReviewerQueue(signals, insightMap, draftMap, engagementMap, {
    ...(relevanceFilter ? { relevanceFilter } : {}),
    excludeRedirected,
  });

  const results = queue
    .filter((item) => item.commentDraft !== undefined || item.redirectRecommended)
    .map((item) => ({
      signal: item.signal,
      insight: item.insight,
      commentDraft: item.commentDraft,
      similarPosts: item.similarPosts,
      redirectTo: item.redirectTo,
      redirectRecommended: item.redirectRecommended,
      queueStatus: item.queueStatus,
      replyUrl: item.replyUrl,
    }));

  return c.json({
    total: results.length,
    subreddit: subreddit ?? null,
    relevanceFilter: relevanceFilter ?? null,
    excludeRedirected,
    results,
  });
});

api.get('/reviewer-queue', async (c) => {
  const subreddit = c.req.query('subreddit') ?? 'hypericum_rsr_dev';
  const relevanceFilter = c.req.query('relevance') ?? undefined;
  const excludeRedirected = parseBoolean(c.req.query('excludeRedirected'), false);

  const queue = await loadReviewerQueueForSubreddit(subreddit, {
    ...(relevanceFilter ? { relevanceFilter } : {}),
    excludeRedirected,
  });

  return c.json({
    total: queue.length,
    subreddit,
    relevanceFilter: relevanceFilter ?? null,
    excludeRedirected,
    items: queue,
  });
});

api.get('/dashboard', async (c) => {
  const subreddit =
    c.req.query('subreddit') ?? 'hypericum_rsr_dev';
  const relevanceFilter = c.req.query('relevance') ?? undefined;
  const excludeRedirected = parseBoolean(c.req.query('excludeRedirected'), false);
  const authToken = c.req.query('token') ?? undefined;

  const queue = await loadReviewerQueueForSubreddit(subreddit, {
    ...(relevanceFilter ? { relevanceFilter } : {}),
    excludeRedirected,
  });

  return c.html(
    renderDashboardPage(queue, {
      subreddit,
      ...(relevanceFilter ? { relevanceFilter } : {}),
      excludeRedirected,
      ...(authToken ? { authToken } : {}),
    })
  );
});
