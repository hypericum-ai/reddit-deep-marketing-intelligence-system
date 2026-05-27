import { Hono } from 'hono';

import type {
  OnAppInstallRequest,
  OnCommentSubmitRequest,
  OnPostSubmitRequest,
  OnPostUpdateRequest,
  TriggerResponse,
} from '@devvit/web/shared';

import { processContentEvent } from '../core/processContentEvent.js';
import { recordDraftEngagementMatch } from '../core/draftEngagement.js';
import { initSubredditConfigOnInstall } from '../storage/subredditConfig.js';
import {
  mapCommentSubmit,
  mapPostSubmit,
  mapPostUpdate,
} from './eventMappers.js';
import { maybeExtractInsightAndDraft } from './triggerPipeline.js';
import type { Signal } from '../types/signal.js';
import type { ProcessResult } from '../core/processContentEvent.js';

export const triggers = new Hono();

function logResult(
  eventType: string,
  contentId: string,
  result: ProcessResult
): void {
  if (result.status === 'saved') {
    const s: Signal = result.signal;
    console.log(
      [
        `\n━━━ RSR ${eventType} SAVED ━━━`,
        `  id         : ${s.contentId}`,
        `  type       : ${s.contentType}`,
        `  subreddit  : r/${s.subreddit}`,
        `  author     : u/${s.author}`,
        `  title      : ${s.title ?? '(comment)'}`,
        `  intent     : score=${s.intent.score}  level=${s.intent.level}  type=${s.intent.intentType}`,
        `  matched    : [${s.intent.matchedSignals.join(', ')}]`,
        `  clusters   : [${s.clusters.join(', ')}]`,
        `  status     : ${s.status ?? 'active'}`,
        ...(s.similarity?.redirectRecommended
          ? [`  redirectTo : ${s.similarity.redirectTo?.contentId ?? 'n/a'}`]
          : []),
        `  engagement : score=${s.engagement.score}${s.engagement.numComments !== undefined ? `  comments=${s.engagement.numComments}` : ''}`,
        `  permalink  : ${s.permalink ?? 'n/a'}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ].join('\n')
    );
  } else if (result.status === 'ignored') {
    console.log(
      `RSR ${eventType} ${contentId}: ignored (${result.reason})`
    );
  } else {
    console.log(`RSR ${eventType} ${contentId}: ${result.status}`);
  }
}

async function maybeTrackDraftEngagement(
  body: OnCommentSubmitRequest
): Promise<void> {
  const postId = body.post?.id ?? body.comment?.postId;
  const comment = body.comment;
  if (!postId || !comment?.id || !comment.body) {
    return;
  }

  const match = await recordDraftEngagementMatch({
    postId,
    commentId: comment.id,
    commentAuthor: body.author?.name ?? comment.author ?? 'unknown',
    commentBody: comment.body,
  });

  if (match) {
    console.log(
      `RSR engagement: ${match.status} on ${match.signalContentId}` +
      ` via ${match.matchedCommentId} score=${match.similarityScore?.toFixed(2) ?? 'n/a'}`
    );
  }
}

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  const subreddit = input.subreddit?.name;

  if (subreddit) {
    await initSubredditConfigOnInstall(subreddit);
  }

  console.log(
    `RSR installed on r/${subreddit ?? 'unknown'}; default config initialized.`
  );

  return c.json<TriggerResponse>({});
});

triggers.post('/on-post-submit', async (c) => {
  const body = await c.req.json<OnPostSubmitRequest>();
  const event = mapPostSubmit(body);
  if (!event) {
    return c.json({ status: 'ignored', reason: 'invalid_payload' });
  }

  const result = await processContentEvent(event);
  logResult('onPostSubmit', event.contentId, result);
  if (result.status === 'saved') void maybeExtractInsightAndDraft(result.signal);
  return c.json({ status: result.status });
});

triggers.post('/on-comment-submit', async (c) => {
  const body = await c.req.json<OnCommentSubmitRequest>();
  const event = mapCommentSubmit(body);
  if (!event) {
    return c.json({ status: 'ignored', reason: 'invalid_payload' });
  }

  void maybeTrackDraftEngagement(body);

  const result = await processContentEvent(event);
  logResult('onCommentSubmit', event.contentId, result);
  if (result.status === 'saved') void maybeExtractInsightAndDraft(result.signal);
  return c.json({ status: result.status });
});

triggers.post('/on-post-update', async (c) => {
  const body = await c.req.json<OnPostUpdateRequest>();
  const event = mapPostUpdate(body);
  if (!event) {
    return c.json({ status: 'ignored', reason: 'invalid_payload' });
  }

  const result = await processContentEvent(event);
  logResult('onPostUpdate', event.contentId, result);
  if (result.status === 'saved') void maybeExtractInsightAndDraft(result.signal);
  return c.json({ status: result.status });
});
