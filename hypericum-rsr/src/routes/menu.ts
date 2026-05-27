import { Hono } from 'hono';
import { settings, reddit } from '@devvit/web/server';
import type { MenuItemRequest } from '@devvit/web/shared';

import { listSignals } from '../storage/redisSignalStore.js';
import { getInsights, insightExists, saveInsight } from '../storage/insightStore.js';
import { getDrafts, draftExists, saveDraft } from '../storage/commentDraftStore.js';
import { extractInsight } from '../core/llmExtraction.js';
import {
  DraftNotApplicableError,
  generateCommentDraft,
} from '../core/commentDraftPipeline.js';
import {
  DRAFT_INTENT_THRESHOLD,
  INSIGHT_INTENT_THRESHOLD,
  shouldDraftComment,
} from '../core/llmPipeline.js';
import { initDraftEngagement } from '../core/draftEngagement.js';
import { shouldSkipLlmPipeline } from '../core/similarityEnrichment.js';
import { aggregateSignals } from '../core/aggregateSignals.js';
import { rankOpportunities } from '../core/rankOpportunities.js';
import { runProactiveSubredditMonitor } from '../core/proactiveSearch.js';
import { scanDraftEngagementForSubreddit } from '../core/engagementScan.js';
import { filterSignalsForExport } from '../core/exportFilter.js';
import { purgeStaleLlmData } from '../core/purgeStaleLlm.js';
import { EXPORT_MIN_DRAFTED_AT_MS } from '../generated/llmPrompts.js';
import { loadMonitorSettings } from '../server/monitorSettings.js';
import {
  buildDashboardPostData,
  dashboardPostDataByteLength,
  loadReviewerQueueForSubreddit,
} from '../server/loadReviewerQueue.js';

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export const menu = new Hono();

menu.post('/create-dashboard', async (c) => {
  let body: MenuItemRequest;
  try {
    body = await c.req.json<MenuItemRequest>();
  } catch (e) {
    console.error('RSR: failed to parse create-dashboard request', e);
    return c.json({
      showToast: { text: 'Invalid dashboard request', appearance: 'neutral' },
    });
  }

  try {
    const subredditInfo = await reddit.getSubredditInfoById(
      body.targetId as `t5_${string}`
    );
    if (!subredditInfo.name) {
      return c.json({
        showToast: { text: 'Subreddit not found', appearance: 'neutral' },
      });
    }

    const queue = await loadReviewerQueueForSubreddit(subredditInfo.name);
    const postData = buildDashboardPostData(subredditInfo.name, queue);
    console.log(
      `RSR: dashboard postData ${dashboardPostDataByteLength(postData)} bytes, ${queue.length} queue item(s)`
    );

    const post = await reddit.submitCustomPost({
      subredditName: subredditInfo.name,
      title: 'RSR Review Dashboard',
      entry: 'default',
      runAs: 'APP',
      postData,
    });

    let syncHint = '';
    try {
      await post.setPostData(postData);
    } catch (postDataErr) {
      console.error('RSR: create-dashboard setPostData retry failed', postDataErr);
      syncHint = ' Sync Dashboard from post menu if queue looks empty.';
    }

    console.log(
      `RSR: created review dashboard post ${post.id} in r/${subredditInfo.name}`
    );

    return c.json({
      showToast: {
        text: syncHint
          ? `Dashboard created.${syncHint}`
          : `RSR Review Dashboard created (${queue.length} items)`,
        appearance: 'success',
      },
      navigateTo: `https://reddit.com${post.permalink}`,
    });
  } catch (err) {
    console.error('RSR: create-dashboard failed', err);
    return c.json({
      showToast: {
        text: `Failed to create review dashboard: ${formatError(err).slice(0, 120)}`,
        appearance: 'neutral',
      },
    });
  }
});

menu.post('/sync-dashboard', async (c) => {
  let body: MenuItemRequest;
  try {
    body = await c.req.json<MenuItemRequest>();
  } catch (e) {
    console.error('RSR: failed to parse sync-dashboard request', e);
    return c.json({
      showToast: { text: 'Invalid sync request', appearance: 'neutral' },
    });
  }

  try {
    const post = await reddit.getPostById(body.targetId as `t3_${string}`);
    const existing = (await post.getPostData().catch(() => undefined)) as
      | { subreddit?: string }
      | undefined;
    const subreddit = existing?.subreddit ?? post.subredditName;
    if (!subreddit) {
      return c.json({
        showToast: { text: 'Subreddit not found for post', appearance: 'neutral' },
      });
    }

    const queue = await loadReviewerQueueForSubreddit(subreddit);
    const postData = buildDashboardPostData(subreddit, queue);
    console.log(
      `RSR: sync dashboard postData ${dashboardPostDataByteLength(postData)} bytes` +
      ` (${(postData.items as unknown[] | undefined)?.length ?? 0} embedded items,` +
      ` ${queue.length} total queue items)`
    );
    await post.setPostData(postData);

    console.log(`RSR: synced dashboard post ${post.id} (${queue.length} items)`);

    return c.json({
      showToast: {
        text: `Dashboard synced (${queue.length} items). Reload the post.`,
        appearance: 'success',
      },
    });
  } catch (err) {
    console.error('RSR: sync-dashboard failed', err);
    return c.json({
      showToast: {
        text: 'Failed to sync dashboard',
        appearance: 'neutral',
      },
    });
  }
});

menu.post('/run-monitor', async (c) => {
  try {
    let homeSub = 'hypericum_rsr_dev';
    try {
      const body = await c.req.json<MenuItemRequest>();
      if (body.location === 'subreddit') {
        const subredditInfo = await reddit.getSubredditInfoById(
          body.targetId as `t5_${string}`
        );
        homeSub = subredditInfo.name ?? homeSub;
      }
    } catch {
      /* optional body */
    }

    const settings = await loadMonitorSettings();
    const subreddits =
      settings.monitorSubreddits.length > 0
        ? settings.monitorSubreddits
        : [homeSub];

    const result = await runProactiveSubredditMonitor({ subreddits });
    const usingDefault = settings.monitorSubreddits.length === 0;

    return c.json({
      showToast: {
        text:
          result.fetched === 0
            ? `Monitor: no posts fetched. ${usingDefault ? `Scanning r/${homeSub} only — add Monitor subreddits in app settings.` : 'Check subreddit names in app settings.'}`
            : `Monitor: ${result.saved} new signal(s) from ${result.fetched} post(s) scanned`,
        appearance: result.saved > 0 ? 'success' : 'neutral',
      },
    });
  } catch (err) {
    console.error('RSR: run-monitor failed', err);
    return c.json({
      showToast: {
        text: `Monitor failed: ${formatError(err).slice(0, 100)}`,
        appearance: 'neutral',
      },
    });
  }
});

menu.post('/check-engagement', async (c) => {
  try {
    let subreddit = 'hypericum_rsr_dev';
    try {
      const body = await c.req.json<MenuItemRequest>();
      if (body.location === 'subreddit') {
        const subredditInfo = await reddit.getSubredditInfoById(
          body.targetId as `t5_${string}`
        );
        subreddit = subredditInfo.name ?? subreddit;
      }
    } catch {
      // Optional body for subreddit resolution.
    }

    const queue = await loadReviewerQueueForSubreddit(subreddit);
    for (const item of queue) {
      if (item.commentDraft && !item.draftEngagement) {
        const trackId = item.redirectTo?.contentId ?? item.signal.contentId;
        await initDraftEngagement(trackId);
      }
    }

    const result = await scanDraftEngagementForSubreddit(subreddit);
    const toastText =
      result.matchesFound > 0
        ? `Engagement: ${result.matchesFound} match(es) found. Sync Dashboard + reload to see badges.`
        : `Engagement: no matches in ${result.checkedThreads} thread(s) for ${result.checkedPosts} draft(s).` +
          (result.skippedInvalid > 0 ? ` (${result.skippedInvalid} skipped)` : '');

    return c.json({
      showToast: {
        text: toastText,
        appearance: result.matchesFound > 0 ? 'success' : 'neutral',
      },
    });
  } catch (err) {
    console.error('RSR: check-engagement failed', err);
    return c.json({
      showToast: {
        text: `Engagement check failed: ${formatError(err).slice(0, 100)}`,
        appearance: 'neutral',
      },
    });
  }
});

menu.post('/dump-signals', async (c) => {
  console.log('RSR: dump-signals triggered');

  let body: MenuItemRequest;
  try {
    body = await c.req.json<MenuItemRequest>();
  } catch (e) {
    console.error('RSR: failed to parse request body', e);
    return c.json({});
  }

  console.log(`RSR: dump requested from ${body.location}:${body.targetId}`);

  let signals;
  try {
    signals = await listSignals({ limit: 100 });
  } catch (e) {
    console.error('RSR: listSignals failed', e);
    return c.json({});
  }

  const apiKey = await settings.get<string>('geminiApiKey').catch(() => '') ?? '';

  if (apiKey) {
    const backfillCandidates = signals.filter((s) => s.intent.score >= INSIGHT_INTENT_THRESHOLD);

    // Backfill Step 1: LLM insight extraction
    for (const signal of backfillCandidates) {
      if (shouldSkipLlmPipeline(signal)) {
        console.log(
          `RSR LLM backfill: skipping ${signal.contentId} (redirect recommended)`
        );
        continue;
      }
      if (await insightExists(signal.contentId).catch(() => true)) continue;
      try {
        const insight = await extractInsight(signal, apiKey);
        await saveInsight(insight);
        console.log(
          `RSR LLM backfill insight: ${signal.contentId}  domain=${insight.hypericumDomain}` +
          `  hook="${insight.marketingHook}"`
        );
      } catch (err) {
        console.error(`RSR LLM backfill insight failed for ${signal.contentId}:`, err);
      }
    }

    // Backfill Step 2: Comment draft generation (score >= 70 + Hypericum domain match)
    const draftCandidates = backfillCandidates.filter(
      (s) => s.intent.score >= DRAFT_INTENT_THRESHOLD
    );
    const contentIds = draftCandidates.map((s) => s.contentId);
    const insightMap = await getInsights(contentIds).catch(() => new Map());

    for (const signal of draftCandidates) {
      if (shouldSkipLlmPipeline(signal)) continue;
      if (await draftExists(signal.contentId).catch(() => true)) continue;
      const insight = insightMap.get(signal.contentId);
      if (!insight) continue;
      if (!shouldDraftComment(signal, insight)) {
        console.log(
          `RSR LLM backfill: skipping draft for ${signal.contentId}` +
          ` — off-domain (domain=${insight.hypericumDomain})`
        );
        continue;
      }
      try {
        const draft = await generateCommentDraft(signal, insight, apiKey);
        await saveDraft(draft);
        await initDraftEngagement(signal.contentId);
        console.log(
          `RSR LLM backfill draft: ${signal.contentId}  relevance=${draft.relevance}` +
          `  domain="${draft.domainMatch}"`
        );
      } catch (err) {
        if (err instanceof DraftNotApplicableError) {
          console.log(`RSR LLM backfill: ${err.message}`);
          continue;
        }
        console.error(`RSR LLM backfill draft failed for ${signal.contentId}:`, err);
      }
    }
  } else {
    console.log('RSR LLM: no Gemini API key set — skipping insight and draft extraction');
  }

  const contentIds = signals.map((s) => s.contentId);
  const insightMap = await getInsights(contentIds).catch(() => new Map());
  const draftMap = await getDrafts(contentIds).catch(() => new Map());
  const exportSignals = filterSignalsForExport(signals, draftMap, insightMap);

  const aggregated = aggregateSignals(exportSignals);
  const ranked = rankOpportunities(aggregated);

  // ── Terminal log ──────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(
    `RSR SIGNAL DUMP  — total: ${signals.length}` +
    `  exportable: ${exportSignals.length}` +
    `  insights: ${insightMap.size}  drafts: ${draftMap.size}` +
    `  minDraftedAt: ${EXPORT_MIN_DRAFTED_AT_MS || 'none'}`
  );
  console.log('═'.repeat(60));

  if (signals.length === 0) {
    console.log('  (no signals stored yet)');
  }

  for (const s of exportSignals) {
    console.log(
      `  [${s.contentType}] ${s.contentId}  r/${s.subreddit}  ` +
      `score=${s.intent.score}  type=${s.intent.intentType}  ` +
      `clusters=[${s.clusters.join(', ')}]`
    );
    console.log(`    title: ${s.title ?? s.text.slice(0, 80)}`);
    console.log(`    url  : ${s.permalink ? `https://reddit.com${s.permalink}` : 'n/a'}`);
    if (s.similarity?.redirectRecommended) {
      console.log(
        `    redirect: reply on ${s.similarity.redirectTo?.contentId ?? 'canonical thread'}` +
        `  (${s.similarity.redirectTo?.matchReason ?? 'similar post'})`
      );
    }

    const insight = insightMap.get(s.contentId);
    if (insight) {
      console.log(`    ── LLM Insight ──`);
      console.log(`       pain      : ${insight.painPoint}`);
      console.log(`       context   : ${insight.userContext}`);
      console.log(`       workaround: ${insight.currentWorkaround}`);
      console.log(`       wants     : ${insight.desiredSolution}`);
      console.log(`       tone      : ${insight.emotionalTone}  urgency=${insight.urgency}`);
      console.log(`       domain    : ${insight.hypericumDomain}`);
      console.log(`       hook      : "${insight.marketingHook}"`);
    }

    const draft = draftMap.get(s.contentId);
    if (draft) {
      console.log(`    ── Comment Draft ──`);
      console.log(`       relevance : ${draft.relevance}  (${draft.relevanceReason})`);
      console.log(`       domain    : ${draft.domainMatch}`);
      console.log(`       guidance  : ${draft.postingGuidance}`);
      console.log(`       --- DRAFT ---`);
      console.log(draft.draft.split('\n').map((l: string) => `       ${l}`).join('\n'));
      console.log(`       --- END DRAFT ---`);
    }
  }

  if (ranked.length > 0) {
    console.log(`\n── RANKED OPPORTUNITIES ──`);
    for (const opp of ranked) {
      console.log(
        `  ${opp.category.padEnd(32)}  ` +
        `score=${opp.opportunityScore}  ` +
        `freq=${opp.frequency}  avgIntent=${opp.avgIntent}`
      );
    }
  }

  console.log('═'.repeat(60));

  // ── Emit JSON for local capture script (chunked to avoid terminal line-length truncation) ──
  const compactSignals = exportSignals.map(({ text: _t, cleanText: _c, ...rest }) => ({
    ...rest,
    insight: insightMap.get(rest.contentId),
    commentDraft: draftMap.get(rest.contentId),
  }));
  const exportPayload = JSON.stringify({
    exportedAt: new Date().toISOString(),
    signals: compactSignals,
    ranked,
  });

  const CHUNK_SIZE = 2000;
  const totalChunks = Math.ceil(exportPayload.length / CHUNK_SIZE);
  console.log(`RSR_EXPORT_START:${totalChunks}`);
  for (let i = 0; i < totalChunks; i++) {
    const chunk = exportPayload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    console.log(`RSR_CHUNK:${i}:${chunk}`);
  }
  console.log(`RSR_EXPORT_END:${totalChunks}`);
  console.log('RSR: run  npm run export  in a second terminal to save to exports/\n');

  return c.json({});
});

menu.post('/purge-stale-llm', async (c) => {
  try {
    const result = await purgeStaleLlmData();
    console.log(
      `RSR purge: scanned=${result.scannedSignals}  deletedDrafts=${result.deletedDrafts}` +
      `  deletedInsights=${result.deletedInsights}  minDraftedAt=${result.minDraftedAtMs}`
    );
    return c.json({
      showToast: {
        text:
          `Purged ${result.deletedDrafts} draft(s) and ${result.deletedInsights} insight(s)`,
        appearance: 'success',
      },
    });
  } catch (err) {
    console.error('RSR: purge-stale-llm failed', err);
    return c.json({
      showToast: {
        text: `Purge failed: ${formatError(err).slice(0, 100)}`,
        appearance: 'neutral',
      },
    });
  }
});
