import { EffectType } from '@devvit/protos/json/devvit/ui/effects/v1alpha/effect.js';
import { ToastAppearance } from '@devvit/protos/json/devvit/ui/toast/toast.js';
import { emitEffect } from '@devvit/shared-types/client/emit-effect.js';

type QueueItem = {
  signal: {
    contentId: string;
    subreddit: string;
    title?: string;
    intent: { score: number };
    clusters: string[];
  };
  insight?: { painPoint: string; emotionalTone: string; urgency: string };
  commentDraft?: {
    draft: string;
    relevance: string;
    postingGuidance?: string;
  };
  draftEngagement?: {
    status: 'pending' | 'posted' | 'partial';
    matchedAuthor?: string;
    similarityScore?: number;
  };
  queueStatus: 'active' | 'redirected';
  redirectTo?: { title?: string; contentId: string; matchReason?: string };
  replyUrl?: string;
};

type DashboardPostData = {
  subreddit: string;
  generatedAt: string;
  items: QueueItem[];
};

type DevvitClientGlobal = typeof globalThis & {
  devvit?: {
    token?: string;
    context?: { postData?: unknown; subredditName?: string };
  };
};

function getDevvit(): DevvitClientGlobal['devvit'] {
  return (globalThis as DevvitClientGlobal).devvit;
}

function hasDevvitAuth(): boolean {
  return Boolean(getDevvit()?.token);
}

function parseDashboardPostData(raw: unknown): DashboardPostData | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const data =
    record.items !== undefined
      ? record
      : (record.developerData as Record<string, unknown> | undefined);

  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
    return undefined;
  }

  return {
    subreddit: String(data.subreddit ?? DEFAULT_SUBREDDIT),
    generatedAt: String(data.generatedAt ?? ''),
    items: data.items as QueueItem[],
  };
}

export {};

const DEFAULT_SUBREDDIT = 'hypericum_rsr_dev';
const THEME_STORAGE_KEY = 'rsr-dash-theme';
const VIEWPORT_STORAGE_KEY = 'rsr-dash-viewport';
const DRAFT_PREVIEW_LINES = 4;
const DRAFT_PREVIEW_MIN_CHARS = 200;

type ThemeMode = 'dark' | 'light';
type ViewportMode = 'mobile' | 'desktop' | 'wide';

const SUN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" class="moon-icon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

const state = {
  subreddit: DEFAULT_SUBREDDIT,
  relevanceFilter: '',
  excludeRedirected: false,
  items: [] as QueueItem[],
  theme: 'dark' as ThemeMode,
  viewport: 'desktop' as ViewportMode,
  fullscreen: false,
  bootstrapped: false,
  expandedDrafts: new Set<string>(),
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function threadUrl(item: QueueItem): string {
  if (item.replyUrl && item.replyUrl !== '#') {
    return item.replyUrl;
  }

  const contentId = item.redirectTo?.contentId ?? item.signal.contentId;
  const bareId = contentId.startsWith('t3_') ? contentId.slice(3) : contentId;
  return `https://www.reddit.com/r/${item.signal.subreddit}/comments/${bareId}/`;
}

function threadLink(label: string, url: string): string {
  return `<button type="button" class="thread-link action-btn" data-thread-url="${escapeHtml(url)}">${escapeHtml(label)}</button>`;
}

function openThread(url: string): void {
  try {
    const normalizedUrl = new URL(url).toString();
    void emitEffect({
      type: EffectType.EFFECT_NAVIGATE_TO_URL,
      navigateToUrl: { url: normalizedUrl },
    });
  } catch {
    globalThis.open(url, '_blank', 'noopener');
  }
}

function applyFilters(items: QueueItem[]): QueueItem[] {
  return items.filter((item) => {
    if (state.excludeRedirected && item.queueStatus === 'redirected') {
      return false;
    }
    if (
      state.relevanceFilter &&
      item.commentDraft?.relevance !== state.relevanceFilter
    ) {
      return false;
    }
    return true;
  });
}

function showToast(text: string, success = true): void {
  try {
    void emitEffect({
      type: EffectType.EFFECT_SHOW_TOAST,
      showToast: {
        toast: {
          text,
          appearance: success ? ToastAppearance.SUCCESS : ToastAppearance.NEUTRAL,
        },
      },
    });
  } catch {
    setStatus(text, !success);
  }
}

function engagementLabel(item: QueueItem): string {
  const engagement = item.draftEngagement;
  if (!engagement || !item.commentDraft) {
    return '';
  }

  const labels: Record<'pending' | 'posted' | 'partial', string> = {
    pending: 'Not posted yet',
    posted: 'Draft posted',
    partial: 'Partial match',
  };

  let label = labels[engagement.status];
  if (engagement.matchedAuthor) {
    label += ` · u/${engagement.matchedAuthor}`;
  }
  if (engagement.similarityScore !== undefined) {
    label += ` · ${Math.round(engagement.similarityScore * 100)}% match`;
  }
  return label;
}

function engagementPill(item: QueueItem): string {
  const engagement = item.draftEngagement;
  if (!engagement || !item.commentDraft) {
    return '';
  }
  return `<span class="pill engagement ${escapeHtml(engagement.status)}" title="${escapeHtml(engagementLabel(item))}">${escapeHtml(engagementLabel(item))}</span>`;
}

async function copyDraft(contentId: string): Promise<void> {
  const item = state.items.find((entry) => entry.signal.contentId === contentId);
  const draft = item?.commentDraft?.draft;
  if (!draft) {
    showToast('No draft to copy', false);
    return;
  }

  try {
    await navigator.clipboard.writeText(draft);
    showToast('Draft copied to clipboard');
  } catch {
    showToast('Copy failed — select the draft text manually', false);
  }
}

function draftNeedsPreview(text: string): boolean {
  return (
    text.length > DRAFT_PREVIEW_MIN_CHARS ||
    text.split('\n').length > DRAFT_PREVIEW_LINES
  );
}

function renderDraftBlock(
  draft: string,
  contentId: string,
  redirected: boolean
): string {
  const label = redirected ? ' (canonical thread)' : '';
  const expanded = state.expandedDrafts.has(contentId);
  const collapsible = draftNeedsPreview(draft);
  const clamped = collapsible && !expanded;

  const toggle = collapsible
    ? expanded
      ? `<button type="button" class="draft-toggle" data-collapse-draft="${escapeHtml(contentId)}">See less</button>`
      : `<button type="button" class="draft-toggle" data-expand-draft="${escapeHtml(contentId)}">See more</button>`
    : '';

  return `<div class="section-label">Draft${label}</div>
    <div class="draft${clamped ? ' is-clamped' : ''}">
      <div class="draft-text">${escapeHtml(draft)}</div>
      ${toggle}
    </div>`;
}

function toggleDraftExpanded(contentId: string, expand: boolean): void {
  if (expand) {
    state.expandedDrafts.add(contentId);
  } else {
    state.expandedDrafts.delete(contentId);
  }
  renderList();
}

function renderItem(item: QueueItem): string {
  const signal = item.signal;
  const title = signal.title || signal.contentId;
  const redirected = item.queueStatus === 'redirected';
  const url = threadUrl(item);
  const redirectTitle = item.redirectTo?.title || item.redirectTo?.contentId;

  const banner = redirected
    ? `<div class="banner">
        Reply on the existing thread instead:
        ${threadLink(redirectTitle || 'Open canonical thread', url)}
        (${escapeHtml(item.redirectTo?.matchReason || 'similar post')})
      </div>`
    : '';

  const insightBlock = item.insight
    ? `<div class="section-label">Insight</div>
       <div>${escapeHtml(item.insight.painPoint)}</div>
       <div class="meta">Tone: ${escapeHtml(item.insight.emotionalTone)} · Urgency: ${escapeHtml(item.insight.urgency)}</div>`
    : '';

  const draftBlock = item.commentDraft
    ? renderDraftBlock(
        item.commentDraft.draft,
        item.signal.contentId,
        redirected
      )
    : redirected
      ? `<div class="meta">No draft on canonical thread yet.</div>`
      : `<div class="meta">Draft pending…</div>`;

  const relevance = item.commentDraft
    ? `<span class="pill ${escapeHtml(item.commentDraft.relevance)}">${escapeHtml(item.commentDraft.relevance)}</span>`
    : '';

  const engagement = engagementPill(item);

  const copyBtn = item.commentDraft
    ? `<button type="button" class="action-btn" data-copy-draft="${escapeHtml(item.signal.contentId)}">Copy draft</button>`
    : '';

  return `<article class="card ${redirected ? 'redirected' : ''}">
    ${banner}
    <div class="meta">
      r/${escapeHtml(signal.subreddit)}
      · score ${signal.intent.score}
      · ${escapeHtml(signal.clusters.join(', '))}
      ${relevance}
      ${engagement}
    </div>
    <h2 class="title">${escapeHtml(title)}</h2>
    ${insightBlock}
    ${draftBlock}
    <div class="actions">
      ${threadLink('Open thread', url)}
      ${copyBtn}
    </div>
  </article>`;
}

function renderList(): void {
  const list = document.getElementById('list');
  const stats = document.getElementById('stats');
  const hint = document.getElementById('hint');
  if (!list || !stats || !hint) {
    return;
  }

  const visible = applyFilters(state.items);
  list.innerHTML =
    visible.length > 0
      ? visible.map(renderItem).join('')
      : '<div class="empty">No review items match the current filters. Post a qualifying thread, then Sync or Refresh.</div>';

  stats.textContent = `${visible.length} item(s) in queue`;
  const loadMode = state.bootstrapped ? 'Loaded from post snapshot.' : 'Loaded live.';
  const updateHint = state.bootstrapped
    ? 'Use Refresh, or post ⋮ → RSR: Sync Dashboard, then reload.'
    : 'Click Refresh to update queue and engagement badges.';
  hint.textContent = state.items.length
    ? `Queue for r/${state.subreddit}. ${loadMode} ${updateHint}`
    : `Queue for r/${state.subreddit}. Empty — post a qualifying thread, then Refresh.`;
}

function setStatus(message: string, isError = false): void {
  const status = document.getElementById('status');
  if (!status) {
    return;
  }
  status.textContent = message;
  status.className = isError ? 'err' : '';
  status.hidden = message.length === 0;
}

function readBootstrap(): boolean {
  const ctx = getDevvit()?.context;
  const parsed = parseDashboardPostData(ctx?.postData);
  const subreddit =
    parsed?.subreddit ??
    ctx?.subredditName ??
    DEFAULT_SUBREDDIT;

  state.subreddit = subreddit;
  if (parsed) {
    state.items = parsed.items;
    state.bootstrapped = true;
    return parsed.items.length > 0;
  }
  return false;
}

function waitForPostData(maxMs = 8000): Promise<boolean> {
  if (readBootstrap()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const started = Date.now();
    const poll = (): void => {
      if (readBootstrap()) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= maxMs) {
        resolve(state.items.length > 0);
        return;
      }
      window.setTimeout(poll, 120);
    };
    poll();
  });
}

async function loadQueueOnStartup(): Promise<void> {
  await waitForPostData();

  if (state.items.length > 0) {
    return;
  }

  if (!hasDevvitAuth()) {
    return;
  }

  try {
    await refreshFromApi();
  } catch {
    /* live refresh unavailable — snapshot or Sync Dashboard required */
  }
}

async function refreshFromApi(): Promise<boolean> {
  const params = new URLSearchParams({ subreddit: state.subreddit });
  if (state.relevanceFilter) {
    params.set('relevance', state.relevanceFilter);
  }
  if (state.excludeRedirected) {
    params.set('excludeRedirected', 'true');
  }

  const res = await fetch(`/api/reviewer-queue?${params.toString()}`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = (await res.json()) as { items: QueueItem[] };
  state.items = data.items;
  return true;
}

async function onRefresh(): Promise<void> {
  setStatus('Refreshing…');
  try {
    await refreshFromApi();
    renderList();
    setStatus('');
  } catch {
    renderList();
    setStatus(
      'Live refresh unavailable here. Use post ⋮ menu → RSR: Sync Dashboard, then reload this page.',
      true
    );
  }
}

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function readStoredViewport(): ViewportMode {
  try {
    const stored = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (stored === 'mobile' || stored === 'desktop' || stored === 'wide') {
      return stored;
    }
    const legacy = localStorage.getItem('rsr-dash-layout');
    if (legacy === 'wide') {
      return 'wide';
    }
  } catch {
    /* ignore */
  }
  return 'desktop';
}

function applyTheme(theme: ThemeMode): void {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }

  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    const next = theme === 'dark' ? 'light' : 'dark';
    themeBtn.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
    themeBtn.setAttribute(
      'aria-label',
      next === 'light' ? 'Switch to light mode' : 'Switch to dark mode'
    );
  }
}

function applyViewport(viewport: ViewportMode): void {
  state.viewport = viewport;
  document.documentElement.setAttribute('data-viewport', viewport);
  try {
    localStorage.setItem(VIEWPORT_STORAGE_KEY, viewport);
  } catch {
    /* ignore */
  }
  syncScreenSelect();
}

function syncScreenSelect(): void {
  const screenSelect = document.getElementById(
    'screenSelect'
  ) as HTMLSelectElement | null;
  if (!screenSelect) {
    return;
  }
  const value = state.fullscreen ? 'fullscreen' : state.viewport;
  if (screenSelect.value !== value) {
    screenSelect.value = value;
  }
}

function syncFullscreenUi(active: boolean): void {
  state.fullscreen = active;
  document.documentElement.classList.toggle('is-fullscreen', active);
  syncScreenSelect();
}

async function onScreenChange(value: string): Promise<void> {
  if (value === 'fullscreen') {
    if (!document.fullscreenElement && !state.fullscreen) {
      await toggleFullscreen();
    } else {
      syncFullscreenUi(true);
    }
    return;
  }

  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }
  syncFullscreenUi(false);
  applyViewport(value as ViewportMode);
}

function toggleTheme(): void {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

async function toggleFullscreen(): Promise<void> {
  const root = document.documentElement;

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (root.requestFullscreen) {
      await root.requestFullscreen();
      return;
    }

    syncFullscreenUi(!state.fullscreen);
    showToast(
      state.fullscreen ? 'Expanded to full width' : 'Exited expanded view',
      true
    );
  } catch {
    syncFullscreenUi(!state.fullscreen);
    showToast(
      state.fullscreen
        ? 'Expanded view enabled (native full screen unavailable)'
        : 'Exited expanded view',
      true
    );
  }
}

function initDisplayPreferences(): void {
  applyTheme(readStoredTheme());
  applyViewport(readStoredViewport());
  syncFullscreenUi(Boolean(document.fullscreenElement));

  document.addEventListener('fullscreenchange', () => {
    syncFullscreenUi(Boolean(document.fullscreenElement));
  });
}

function bindControls(): void {
  const relevance = document.getElementById('relevance') as HTMLSelectElement | null;
  const exclude = document.getElementById('excludeRedirected') as HTMLInputElement | null;
  const refresh = document.getElementById('refreshBtn');
  const list = document.getElementById('list');
  const themeBtn = document.getElementById('themeBtn');
  const screenSelect = document.getElementById('screenSelect') as HTMLSelectElement | null;

  themeBtn?.addEventListener('click', () => {
    toggleTheme();
  });
  screenSelect?.addEventListener('change', () => {
    void onScreenChange(screenSelect.value);
  });

  relevance?.addEventListener('change', () => {
    state.relevanceFilter = relevance.value;
    renderList();
  });
  exclude?.addEventListener('change', () => {
    state.excludeRedirected = exclude.checked;
    renderList();
  });
  refresh?.addEventListener('click', () => {
    void onRefresh();
  });

  list?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const expandBtn = target.closest('[data-expand-draft]') as HTMLElement | null;
    if (expandBtn) {
      event.preventDefault();
      const contentId = expandBtn.getAttribute('data-expand-draft');
      if (contentId) {
        toggleDraftExpanded(contentId, true);
      }
      return;
    }

    const collapseBtn = target.closest('[data-collapse-draft]') as HTMLElement | null;
    if (collapseBtn) {
      event.preventDefault();
      const contentId = collapseBtn.getAttribute('data-collapse-draft');
      if (contentId) {
        toggleDraftExpanded(contentId, false);
      }
      return;
    }

    const copyButton = target.closest('[data-copy-draft]') as HTMLElement | null;
    if (copyButton) {
      event.preventDefault();
      const contentId = copyButton.getAttribute('data-copy-draft');
      if (contentId) {
        void copyDraft(contentId);
      }
      return;
    }

    const button = target.closest('[data-thread-url]') as HTMLElement | null;
    if (!button) {
      return;
    }
    event.preventDefault();
    const url = button.getAttribute('data-thread-url');
    if (url) {
      openThread(url);
    }
  });
}

function init(): void {
  initDisplayPreferences();
  bindControls();
  renderList();
  setStatus('Loading queue…');

  void (async () => {
    await loadQueueOnStartup();
    renderList();

    if (state.items.length > 0) {
      setStatus('');
      return;
    }

    setStatus(
      'Queue empty. Post a qualifying thread, then use post ⋮ → RSR: Sync Dashboard and reload.',
      true
    );
  })();
}

init();
