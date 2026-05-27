import type { ReviewerQueueItem } from '../core/reviewerQueue.js';

export type DashboardPageOptions = {
  subreddit: string;
  relevanceFilter?: string | undefined;
  excludeRedirected: boolean;
  /** Devvit signed request context; preserved on Refresh form submits. */
  authToken?: string | undefined;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderItem(item: ReviewerQueueItem): string {
  const signal = item.signal;
  const draft = item.commentDraft;
  const insight = item.insight;
  const title = signal.title || signal.contentId;
  const redirected = item.queueStatus === 'redirected';
  const replyUrl = item.replyUrl ?? '#';
  const redirectTitle = item.redirectTo?.title || item.redirectTo?.contentId;

  const banner = redirected
    ? `<div class="banner">
        Reply on the existing thread instead:
        <a href="${escapeHtml(replyUrl)}" target="_blank" rel="noopener">
          ${escapeHtml(redirectTitle || 'Open canonical thread')}
        </a>
        (${escapeHtml(item.redirectTo?.matchReason || 'similar post')})
      </div>`
    : '';

  const insightBlock = insight
    ? `<div class="section-label">Insight</div>
       <div>${escapeHtml(insight.painPoint)}</div>
       <div class="meta">Tone: ${escapeHtml(insight.emotionalTone)} · Urgency: ${escapeHtml(insight.urgency)}</div>`
    : '';

  const draftBlock = draft
    ? `<div class="section-label">Draft</div>
       <div class="draft">${escapeHtml(draft.draft)}</div>
       <div class="meta">${escapeHtml(draft.postingGuidance || '')}</div>`
    : redirected
      ? `<div class="meta">Draft suppressed for near-duplicate. Use the canonical thread above.</div>`
      : `<div class="meta">Draft pending…</div>`;

  const relevance = draft
    ? `<span class="pill ${escapeHtml(draft.relevance)}">${escapeHtml(draft.relevance)}</span>`
    : '';

  return `<article class="card ${redirected ? 'redirected' : ''}">
    ${banner}
    <div class="meta">
      r/${escapeHtml(signal.subreddit)}
      · score ${signal.intent.score}
      · ${escapeHtml(signal.clusters.join(', '))}
      ${relevance}
    </div>
    <h2 class="title">${escapeHtml(title)}</h2>
    ${insightBlock}
    ${draftBlock}
    <div class="actions">
      <a href="${escapeHtml(replyUrl)}" target="_blank" rel="noopener">Open thread</a>
    </div>
  </article>`;
}

function optionSelected(current: string, value: string): string {
  return current === value ? ' selected' : '';
}

export function renderDashboardPage(
  items: ReviewerQueueItem[],
  options: DashboardPageOptions
): string {
  const { subreddit, relevanceFilter = '', excludeRedirected, authToken } = options;
  const itemsHtml =
    items.length > 0
      ? items.map(renderItem).join('')
      : '<div class="empty">No review items match the current filters. Post a qualifying thread in the subreddit, then click Refresh.</div>';

  const excludeChecked = excludeRedirected ? ' checked' : '';
  const tokenField = authToken
    ? `<input type="hidden" name="token" value="${escapeHtml(authToken)}" />`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RSR Review Dashboard</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0f1419;
        --panel: #1a2332;
        --border: #2d3a4d;
        --text: #e7ecf3;
        --muted: #9aa7b8;
        --accent: #ff4500;
        --warn: #f5a623;
        --ok: #46d369;
        --link: #6cb6ff;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: var(--bg); color: var(--text); }
      .wrap { max-width: 960px; margin: 0 auto; padding: 20px; }
      header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 1.4rem; }
      .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      select, button { background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font: inherit; }
      button { cursor: pointer; }
      button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
      .stats { color: var(--muted); margin-bottom: 16px; }
      .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 14px; }
      .card.redirected { border-color: var(--warn); }
      .banner { background: rgba(245, 166, 35, 0.15); border: 1px solid var(--warn); color: #ffd27a; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
      .banner a { color: #ffd27a; font-weight: 600; }
      .meta { display: flex; flex-wrap: wrap; gap: 10px; color: var(--muted); font-size: 0.9rem; margin-bottom: 10px; }
      .title { font-size: 1.05rem; font-weight: 600; margin: 0 0 8px; }
      .section-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 14px 0 6px; }
      .draft { white-space: pre-wrap; line-height: 1.5; background: rgba(255,255,255,0.03); border-radius: 8px; padding: 12px; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; border: 1px solid var(--border); }
      .pill.direct { border-color: var(--ok); color: var(--ok); }
      .pill.partial { border-color: var(--link); color: var(--link); }
      .empty { color: var(--muted); padding: 24px; text-align: center; }
      a { color: var(--link); }
      label { color: var(--muted); font-size: 0.9rem; }
      .hint { color: var(--muted); font-size: 0.85rem; margin-bottom: 16px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <h1>RSR Review Dashboard</h1>
        <form class="controls" method="get" action="/api/dashboard">
          <input type="hidden" name="subreddit" value="${escapeHtml(subreddit)}" />
          ${tokenField}
          <select name="relevance">
            <option value=""${optionSelected(relevanceFilter, '')}>All relevance</option>
            <option value="direct"${optionSelected(relevanceFilter, 'direct')}>Direct</option>
            <option value="partial"${optionSelected(relevanceFilter, 'partial')}>Partial</option>
            <option value="none"${optionSelected(relevanceFilter, 'none')}>None</option>
          </select>
          <label>
            <input name="excludeRedirected" type="checkbox" value="true"${excludeChecked} />
            Hide redirected duplicates
          </label>
          <button type="submit" class="primary">Refresh</button>
        </form>
      </header>
      <div class="hint">Server-rendered queue for r/${escapeHtml(subreddit)}. Click Refresh after posting new threads.</div>
      <div class="stats">${items.length} item(s) in queue</div>
      <div id="list">${itemsHtml}</div>
    </div>
  </body>
</html>`;
}
