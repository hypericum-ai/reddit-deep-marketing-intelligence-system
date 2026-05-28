import { EffectType } from '@devvit/protos/json/devvit/ui/effects/v1alpha/effect.js';
import { WebViewImmersiveMode } from '@devvit/protos/json/devvit/ui/effects/web_view/v1alpha/immersive_mode.js';
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
  redirectTo?: {
    title?: string;
    contentId: string;
    matchReason?: string;
    permalink?: string;
  };
  replyUrl?: string;
  similarPosts?: SimilarPostRef[];
};

type SimilarPostRef = {
  contentId: string;
  title?: string;
  permalink?: string;
  similarityScore: number;
  matchReason: string;
};

type DashboardPostData = {
  subreddit: string;
  generatedAt: string;
  items: QueueItem[];
};

type SearchHit = {
  contentId: string;
  subreddit: string;
  title?: string;
  intentScore: number;
  clusters: string[];
  hypericumDomain?: string;
  painPoint?: string;
  draftPreview?: string;
  relevance?: string;
  queueStatus: 'active' | 'redirected';
  permalink?: string;
  matchScore: number;
  matchReason: string;
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
type ViewportMode = 'mobile' | 'desktop';

let lastTrustedClick: MouseEvent | null = null;

const SUN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" class="moon-icon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

const state = {
  subreddit: DEFAULT_SUBREDDIT,
  relevanceFilter: '',
  excludeRedirected: false,
  items: [] as QueueItem[],
  theme: 'dark' as ThemeMode,
  viewport: 'desktop' as ViewportMode,
  expandedLayoutActive: false,
  bootstrapped: false,
  expandedDrafts: new Set<string>(),
  regenerating: new Set<string>(),
  regenTargetId: null as string | null,
  searchBusy: false,
  searchResults: [] as SearchHit[],
  searchAttempted: false,
  lastSearchQuery: '',
};

const HYPERICUM_DOMAIN_SUGGESTIONS = [
  'ai-production-failure',
  'analytics-reconciliation',
  'acquisition-integration',
  'multitenant-saas-ai',
  'regulatory-audit',
  'knowledge-graph-governance',
];

const SEARCH_FETCH_TIMEOUT_MS = 8000;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function subredditFromPermalink(permalink?: string): string | undefined {
  if (!permalink) {
    return undefined;
  }
  const match = permalink.match(/\/r\/([^/]+)\//i);
  return match?.[1];
}

function redditUrlFromPermalink(permalink?: string): string | undefined {
  if (!permalink) {
    return undefined;
  }
  return permalink.startsWith('http')
    ? permalink
    : `https://www.reddit.com${permalink}`;
}

function subredditFromUrl(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return subredditFromPermalink(new URL(url).pathname);
  } catch {
    return subredditFromPermalink(url);
  }
}

function threadUrlForHit(hit: SearchHit): string {
  const item = state.items.find((entry) => entry.signal.contentId === hit.contentId);
  if (item) {
    return threadUrl(item);
  }

  if (hit.permalink) {
    return hit.permalink.startsWith('http')
      ? hit.permalink
      : `https://www.reddit.com${hit.permalink}`;
  }

  const bareId = hit.contentId.startsWith('t3_') ? hit.contentId.slice(3) : hit.contentId;
  return `https://www.reddit.com/r/${hit.subreddit}/comments/${bareId}/`;
}

function tokenizeSearchText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function searchTextForItem(item: QueueItem): string {
  return [
    item.signal.title,
    item.signal.clusters.join(' '),
    item.insight?.painPoint,
    item.insight?.emotionalTone,
    item.commentDraft?.draft,
    item.commentDraft?.relevance,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function suggestQueryForItem(item: QueueItem): string {
  const title = item.signal.title?.trim();
  if (title) {
    return title.replace(/^Eval\s+\d{4}-\d{2}-\d{2}\s*[—-]\s*/i, '').slice(0, 80);
  }
  return item.signal.clusters[0]?.replaceAll('-', ' ') ?? item.signal.contentId;
}

function scoreLocalItem(item: QueueItem, query: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }

  const document = searchTextForItem(item);
  if (document.includes(normalizedQuery)) {
    return 0.95;
  }

  const queryTokens = tokenizeSearchText(normalizedQuery);
  const docTokens = new Set(tokenizeSearchText(document));
  if (queryTokens.length === 0) {
    return 0;
  }

  const overlap = queryTokens.filter((token) => docTokens.has(token)).length;
  if (overlap === 0) {
    return 0;
  }

  return overlap / queryTokens.length;
}

function itemToSearchHit(item: QueueItem, matchScore: number, matchReason: string): SearchHit {
  return {
    contentId: item.signal.contentId,
    subreddit: item.signal.subreddit,
    ...(item.signal.title !== undefined ? { title: item.signal.title } : {}),
    intentScore: item.signal.intent.score,
    clusters: item.signal.clusters,
    ...(item.insight?.painPoint ? { painPoint: item.insight.painPoint } : {}),
    ...(item.commentDraft?.draft
      ? { draftPreview: item.commentDraft.draft.slice(0, 180) }
      : {}),
    ...(item.commentDraft?.relevance ? { relevance: item.commentDraft.relevance } : {}),
    queueStatus: item.queueStatus,
    ...(item.replyUrl && item.replyUrl !== '#'
      ? { permalink: item.replyUrl.replace(/^https:\/\/(www\.)?reddit\.com/, '') }
      : {}),
    matchScore,
    matchReason,
  };
}

function searchLocalQueue(query: string, limit = 20): SearchHit[] {
  return state.items
    .map((item) => {
      const score = scoreLocalItem(item, query);
      if (score <= 0) {
        return undefined;
      }
      return itemToSearchHit(item, score, score >= 0.9 ? 'queue phrase match' : 'queue keyword match');
    })
    .filter((hit): hit is SearchHit => hit !== undefined)
    .sort((a, b) => b.matchScore - a.matchScore || b.intentScore - a.intentScore)
    .slice(0, limit);
}

function uniqueSuggestionQueries(): string[] {
  const queries = new Set<string>();
  for (const item of state.items) {
    queries.add(suggestQueryForItem(item));
    for (const cluster of item.signal.clusters) {
      queries.add(cluster.replaceAll('-', ' '));
    }
  }
  return [...queries].slice(0, 8);
}

function renderSuggestionChip(label: string, query: string): string {
  return `<button type="button" class="search-suggestion-chip" data-search-suggest-query="${escapeHtml(query)}">${escapeHtml(label)}</button>`;
}

function renderBrowseQueueRow(item: QueueItem): string {
  const title = item.signal.title || item.signal.contentId;
  const meta = [
    `score ${item.signal.intent.score}`,
    item.signal.clusters.join(', ') || 'no cluster',
    item.commentDraft?.relevance ?? 'no draft',
  ].join(' · ');

  return `<article class="search-browse-row">
    <div>
      <div class="search-browse-title">${escapeHtml(title)}</div>
      <div class="search-result-meta">${escapeHtml(meta)}</div>
    </div>
    <div class="search-browse-actions">
      <button type="button" class="action-btn" data-search-suggest-query="${escapeHtml(suggestQueryForItem(item))}">Search similar</button>
      <button type="button" class="action-btn" data-browse-queue-item="${escapeHtml(item.signal.contentId)}">Open in queue</button>
    </div>
  </article>`;
}

function renderSearchSuggestionsPanel(options: {
  query?: string;
  emptyResult?: boolean;
} = {}): string {
  const queueItems = state.items.slice(0, 6);
  const topicChips = uniqueSuggestionQueries();
  const domainChips = HYPERICUM_DOMAIN_SUGGESTIONS.map((slug) =>
    renderSuggestionChip(slug.replaceAll('-', ' '), slug)
  );

  const intro = options.emptyResult && options.query
    ? `<p class="search-empty-title">No matches for “${escapeHtml(options.query)}”.</p>
       <p class="search-empty">Try a broader term or pick an existing post below.</p>`
    : `<p class="search-empty">Search stored signals, or start from an existing post in the queue.</p>`;

  const topicSection =
    topicChips.length > 0
      ? `<div class="search-section-label">From current queue</div>
         <div class="search-suggestion-row">${topicChips
           .map((query) => renderSuggestionChip(query, query))
           .join('')}</div>`
      : '';

  const domainSection = `<div class="search-section-label">Hypericum domains</div>
    <div class="search-suggestion-row">${domainChips.join('')}</div>`;

  const browseSection =
    queueItems.length > 0
      ? `<div class="search-section-label">Browse existing threads</div>
         <div class="search-browse-list">${queueItems.map(renderBrowseQueueRow).join('')}</div>`
      : `<div class="search-empty">Queue is empty — post a qualifying thread, then Refresh.</div>`;

  return `<div class="search-suggestions-panel">
    ${intro}
    ${topicSection}
    ${domainSection}
    ${browseSection}
  </div>`;
}

function openSearchModal(): void {
  const modal = document.getElementById('searchModal');
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  state.searchResults = [];
  state.searchAttempted = false;
  state.lastSearchQuery = '';
  renderSearchResults();
  modal?.removeAttribute('hidden');
  input?.focus();
}

function closeSearchModal(): void {
  document.getElementById('searchModal')?.setAttribute('hidden', '');
}

function setSearchBusy(busy: boolean): void {
  state.searchBusy = busy;
  const submit = document.getElementById('searchSubmit') as HTMLButtonElement | null;
  if (submit) {
    submit.disabled = busy;
    submit.textContent = busy ? 'Searching…' : 'Search';
  }
}

function renderSearchResult(hit: SearchHit): string {
  const title = hit.title || hit.contentId;
  const snippet = hit.painPoint || hit.draftPreview || hit.clusters.join(', ');
  const matchPct = Math.round(hit.matchScore * 100);
  const relevance = hit.relevance
    ? `<span class="pill ${escapeHtml(hit.relevance)}">${escapeHtml(hit.relevance)}</span>`
    : '';

  return `<article class="search-result" data-search-result="${escapeHtml(hit.contentId)}">
    <div class="search-result-head">
      <h4 class="search-result-title">${escapeHtml(title)}</h4>
      <button type="button" class="action-btn" data-open-search-hit="${escapeHtml(hit.contentId)}">Open thread</button>
    </div>
    <div class="search-result-meta">
      r/${escapeHtml(hit.subreddit)}
      · score ${hit.intentScore}
      · ${matchPct}% match (${escapeHtml(hit.matchReason)})
      ${hit.hypericumDomain ? ` · ${escapeHtml(hit.hypericumDomain)}` : ''}
      ${relevance}
      ${hit.queueStatus === 'redirected' ? ' · duplicate' : ''}
    </div>
    <p class="search-result-snippet">${escapeHtml(snippet)}</p>
  </article>`;
}

function renderSearchResults(): void {
  const container = document.getElementById('searchResults');
  if (!container) {
    return;
  }

  if (state.searchBusy) {
    container.innerHTML = '<div class="search-empty">Searching stored signals…</div>';
    return;
  }

  if (state.searchResults.length > 0) {
    container.innerHTML = state.searchResults.map(renderSearchResult).join('');
    return;
  }

  if (state.searchAttempted) {
    container.innerHTML = renderSearchSuggestionsPanel({
      query: state.lastSearchQuery,
      emptyResult: true,
    });
    return;
  }

  container.innerHTML = renderSearchSuggestionsPanel();
}

function mergeSearchHits(apiHits: SearchHit[], localHits: SearchHit[]): SearchHit[] {
  const byId = new Map<string, SearchHit>();
  for (const hit of [...apiHits, ...localHits]) {
    const existing = byId.get(hit.contentId);
    if (!existing || hit.matchScore > existing.matchScore) {
      byId.set(hit.contentId, hit);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.matchScore - a.matchScore || b.intentScore - a.intentScore)
    .slice(0, 20);
}

async function fetchSearchResults(query: string): Promise<SearchHit[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SEARCH_FETCH_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      subreddit: state.subreddit,
      q: query,
      limit: '20',
    });
    const res = await fetch(`/api/search-signals?${params.toString()}`, {
      signal: controller.signal,
    });
    const payload = (await res.json()) as {
      error?: string;
      results?: SearchHit[];
    };

    if (!res.ok) {
      throw new Error(payload.error ?? `Search failed (${res.status})`);
    }

    return payload.results ?? [];
  } finally {
    window.clearTimeout(timer);
  }
}

function applySearchQuery(query: string, runSearch = true): void {
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  if (input) {
    input.value = query;
  }
  if (runSearch) {
    void submitSearch();
  }
}

async function submitSearch(): Promise<void> {
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  const query = input?.value.trim() ?? '';
  if (!query) {
    showToast('Enter a search query', false);
    return;
  }

  state.lastSearchQuery = query;
  state.searchAttempted = true;
  setSearchBusy(true);
  renderSearchResults();

  try {
    let apiHits: SearchHit[] = [];
    try {
      apiHits = await fetchSearchResults(query);
    } catch {
      apiHits = [];
    }

    const localHits = searchLocalQueue(query);
    state.searchResults = mergeSearchHits(apiHits, localHits);
    renderSearchResults();

    if (state.searchResults.length === 0) {
      showToast('No matches — try a suggestion below', false);
    }
  } catch (err) {
    state.searchResults = searchLocalQueue(query);
    renderSearchResults();
    if (state.searchResults.length === 0) {
      const message = err instanceof Error ? err.message : 'Search failed';
      showToast(message.slice(0, 120), false);
    }
  } finally {
    setSearchBusy(false);
    renderSearchResults();
  }
}

function focusQueueItem(contentId: string): void {
  const card = document.querySelector(`[data-queue-item="${contentId}"]`);
  if (card instanceof HTMLElement) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('search-highlight');
    window.setTimeout(() => {
      card.classList.remove('search-highlight');
    }, 1800);
    closeSearchModal();
    return;
  }

  const hit = state.searchResults.find((entry) => entry.contentId === contentId);
  if (hit) {
    openThread(threadUrlForHit(hit));
  }
}

function openSearchHit(contentId: string): void {
  const inQueue = state.items.some((entry) => entry.signal.contentId === contentId);
  if (inQueue) {
    focusQueueItem(contentId);
    return;
  }

  const hit = state.searchResults.find((entry) => entry.contentId === contentId);
  if (hit) {
    openThread(threadUrlForHit(hit));
  }
}

function threadUrl(item: QueueItem): string {
  if (item.replyUrl && item.replyUrl !== '#') {
    return item.replyUrl;
  }

  const contentId = item.redirectTo?.contentId ?? item.signal.contentId;
  const bareId = contentId.startsWith('t3_') ? contentId.slice(3) : contentId;
  return `https://www.reddit.com/r/${item.signal.subreddit}/comments/${bareId}/`;
}

function threadLink(
  label: string,
  url: string,
  variant: 'default' | 'banner' = 'default'
): string {
  const className =
    variant === 'banner' ? 'thread-link banner-thread-link' : 'thread-link action-btn';
  return `<button type="button" class="${className}" data-thread-url="${escapeHtml(url)}">${escapeHtml(label)}</button>`;
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

function openRegenModal(contentId: string): void {
  state.regenTargetId = contentId;
  const modal = document.getElementById('regenModal');
  const textarea = document.getElementById('regenContext') as HTMLTextAreaElement | null;
  if (textarea) {
    textarea.value = '';
  }
  modal?.removeAttribute('hidden');
  textarea?.focus();
}

function closeRegenModal(): void {
  state.regenTargetId = null;
  document.getElementById('regenModal')?.setAttribute('hidden', '');
}

function setRegenBusy(busy: boolean): void {
  const confirm = document.getElementById('regenConfirm') as HTMLButtonElement | null;
  const cancel = document.getElementById('regenCancel') as HTMLButtonElement | null;
  if (confirm) {
    confirm.disabled = busy;
    confirm.textContent = busy ? 'Regenerating…' : 'Regenerate';
  }
  if (cancel) {
    cancel.disabled = busy;
  }
}

async function submitRegenerate(): Promise<void> {
  const contentId = state.regenTargetId;
  if (!contentId) {
    return;
  }

  const textarea = document.getElementById('regenContext') as HTMLTextAreaElement | null;
  const additionalContext = textarea?.value.trim() ?? '';

  state.regenerating.add(contentId);
  setRegenBusy(true);
  renderList();
  setStatus('Regenerating draft…');

  try {
    const res = await fetch('/api/regenerate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentId,
        ...(additionalContext ? { additionalContext } : {}),
      }),
    });

    const payload = (await res.json()) as {
      error?: string;
      commentDraft?: QueueItem['commentDraft'];
    };

    if (!res.ok) {
      throw new Error(payload.error ?? `Request failed (${res.status})`);
    }

    if (!payload.commentDraft) {
      throw new Error('No draft returned');
    }

    const index = state.items.findIndex((entry) => entry.signal.contentId === contentId);
    if (index >= 0) {
      state.items[index] = {
        ...state.items[index]!,
        commentDraft: payload.commentDraft,
      };
    }

    state.expandedDrafts.add(contentId);
    closeRegenModal();
    setStatus('');
    showToast('Draft regenerated');
  } catch (err) {
    setStatus('');
    const message = err instanceof Error ? err.message : 'Regeneration failed';
    showToast(message.slice(0, 120), false);
  } finally {
    state.regenerating.delete(contentId);
    setRegenBusy(false);
    renderList();
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

function renderSimilarThreadsBlock(
  item: QueueItem,
  similarPosts: SimilarPostRef[]
): string {
  const matches = similarPosts
    .filter((match) => match.contentId !== item.signal.contentId)
    .slice(0, 4);
  if (matches.length === 0) {
    return '';
  }

  const rows = matches
    .map((match) => {
      const title = match.title || match.contentId;
      const url =
        redditUrlFromPermalink(match.permalink) ??
        `https://www.reddit.com/search/?q=${encodeURIComponent(title)}`;
      const subreddit = subredditFromPermalink(match.permalink);
      const subLabel = subreddit ? `r/${subreddit}` : 'related thread';
      const score = Math.round(match.similarityScore * 100);
      return `<li class="related-thread">
        <button type="button" class="thread-link related-thread-link" data-thread-url="${escapeHtml(url)}">${escapeHtml(title)}</button>
        <span class="related-thread-meta">${escapeHtml(subLabel)} · ${score}% · ${escapeHtml(match.matchReason)}</span>
      </li>`;
    })
    .join('');

  return `<div class="section-label">Related threads</div>
    <ul class="related-threads">${rows}</ul>`;
}

function renderItem(item: QueueItem): string {
  const signal = item.signal;
  const title = signal.title || signal.contentId;
  const redirected = item.queueStatus === 'redirected';
  const url = threadUrl(item);
  const redirectTitle = item.redirectTo?.title || item.redirectTo?.contentId;
  const canonicalSubreddit =
    subredditFromPermalink(item.redirectTo?.permalink) ??
    subredditFromUrl(item.replyUrl);

  const banner = redirected
    ? `<div class="banner">
        <p class="banner-lead">Reply on the existing thread instead:</p>
        ${threadLink(redirectTitle || 'Open canonical thread', url, 'banner')}
        <p class="banner-note">${canonicalSubreddit ? `r/${escapeHtml(canonicalSubreddit)} · ` : ''}${escapeHtml(item.redirectTo?.matchReason || 'similar post')}</p>
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

  const regenBusy = state.regenerating.has(item.signal.contentId);
  const regenBtn = item.commentDraft
    ? `<button type="button" class="action-btn${regenBusy ? ' is-busy' : ''}" data-regen-draft="${escapeHtml(item.signal.contentId)}"${regenBusy ? ' disabled' : ''}>${regenBusy ? 'Regenerating…' : 'Regenerate draft'}</button>`
    : '';

  const similarBlock =
    !redirected && item.similarPosts && item.similarPosts.length > 0
      ? renderSimilarThreadsBlock(item, item.similarPosts)
      : '';

  return `<article class="card ${redirected ? 'redirected' : ''}" data-queue-item="${escapeHtml(item.signal.contentId)}">
    ${banner}
    <div class="meta">
      <span class="subreddit-badge">r/${escapeHtml(signal.subreddit)}</span>
      score ${signal.intent.score}
      · ${escapeHtml(signal.clusters.join(', '))}
      ${relevance}
      ${engagement}
    </div>
    <h2 class="title">${escapeHtml(title)}</h2>
    ${insightBlock}
    ${draftBlock}
    ${similarBlock}
    <div class="actions">
      ${threadLink('Open thread', url)}
      ${copyBtn}
      ${regenBtn}
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

  stats.textContent = `${visible.length} item(s) in queue${queueSubredditSummary(visible)}`;
  const loadMode = state.bootstrapped ? 'Loaded from post snapshot.' : 'Loaded live.';
  const updateHint = state.bootstrapped
    ? 'Use Refresh, or post ⋮ → RSR: Sync Dashboard, then reload.'
    : 'Click Refresh to update queue and engagement badges.';
  hint.textContent = state.items.length
    ? `Home sub r/${state.subreddit} plus monitored subs. Each card is one thread — orange banners mark same-sub duplicates. Search (🔍) finds similar threads across all stored subs. ${loadMode} ${updateHint}`
    : `Queue for r/${state.subreddit}. Empty — post a qualifying thread, then Refresh.`;
}

function queueSubredditSummary(items: QueueItem[]): string {
  const subreddits = new Set(items.map((item) => item.signal.subreddit));
  if (subreddits.size <= 1) {
    return '';
  }
  return ` across ${subreddits.size} subreddits`;
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

function readWebViewMode(): 'inline' | 'expanded' {
  const devvit = (globalThis as { devvit?: { webViewMode?: number } }).devvit;
  if (devvit?.webViewMode === WebViewImmersiveMode.IMMERSIVE_MODE) {
    return 'expanded';
  }
  return 'inline';
}

function requestDevvitExpandedMode(click: MouseEvent): void {
  if (!click.isTrusted || click.type !== 'click') {
    throw new Error('Untrusted event');
  }
  emitEffect({
    type: EffectType.EFFECT_WEB_VIEW,
    immersiveMode: { immersiveMode: WebViewImmersiveMode.IMMERSIVE_MODE },
  });
}

function exitDevvitExpandedMode(click: MouseEvent): void {
  if (!click.isTrusted || click.type !== 'click') {
    throw new Error('Untrusted event');
  }
  emitEffect({
    type: EffectType.EFFECT_WEB_VIEW,
    immersiveMode: { immersiveMode: WebViewImmersiveMode.INLINE_MODE },
  });
}

function readStoredViewport(): ViewportMode {
  try {
    const stored = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (stored === 'mobile' || stored === 'desktop') {
      return stored;
    }
    if (stored === 'wide') {
      return 'desktop';
    }
    const legacy = localStorage.getItem('rsr-dash-layout');
    if (legacy === 'wide') {
      return 'desktop';
    }
  } catch {
    /* ignore */
  }
  return 'desktop';
}

function isExpandedView(): boolean {
  return readWebViewMode() === 'expanded';
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
  const value = isExpandedLayout() ? 'fullscreen' : state.viewport;
  if (screenSelect.value !== value) {
    screenSelect.value = value;
  }
}

function isExpandedLayout(): boolean {
  return isExpandedView() || state.expandedLayoutActive;
}

function syncExpandedLayout(): void {
  if (!isExpandedView()) {
    state.expandedLayoutActive = false;
  }
  document.documentElement.toggleAttribute(
    'data-expanded',
    isExpandedLayout()
  );
  syncScreenSelect();
}

async function onScreenChange(value: string): Promise<void> {
  if (value === 'fullscreen') {
    if (isExpandedLayout()) {
      syncExpandedLayout();
      return;
    }

    const click = lastTrustedClick;
    if (!click) {
      showToast('Could not expand — try again', false);
      syncScreenSelect();
      return;
    }

    try {
      requestDevvitExpandedMode(click);
      state.expandedLayoutActive = true;
      syncExpandedLayout();
      showToast('Expanded to full screen', true);
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('already expanded')
          ? 'Already in full screen'
          : 'Full screen unavailable here';
      showToast(message, false);
      syncScreenSelect();
    }
    return;
  }

  if (isExpandedView()) {
    const click = lastTrustedClick;
    if (click) {
      try {
        exitDevvitExpandedMode(click);
      } catch {
        /* ignore */
      }
    }
    state.expandedLayoutActive = false;
    syncExpandedLayout();
  }

  applyViewport(value as ViewportMode);
}

function toggleTheme(): void {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function initDisplayPreferences(): void {
  applyTheme(readStoredTheme());
  applyViewport(readStoredViewport());
  syncExpandedLayout();

  document.addEventListener(
    'click',
    (event) => {
      if (event.isTrusted) {
        lastTrustedClick = event;
      }
    },
    true
  );

  window.addEventListener('focus', () => {
    syncExpandedLayout();
  });

  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'devvit-message') {
      return;
    }
    if (event.data?.data?.immersiveModeEvent) {
      syncExpandedLayout();
    }
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

  document.getElementById('searchBtn')?.addEventListener('click', () => {
    openSearchModal();
  });
  document.getElementById('searchClose')?.addEventListener('click', () => {
    closeSearchModal();
  });
  document.getElementById('searchSubmit')?.addEventListener('click', () => {
    void submitSearch();
  });
  document.getElementById('searchInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitSearch();
    }
  });
  document.getElementById('searchModal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
      closeSearchModal();
    }
  });
  document.getElementById('searchResults')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const suggestBtn = target.closest('[data-search-suggest-query]') as HTMLElement | null;
    if (suggestBtn) {
      event.preventDefault();
      const query = suggestBtn.getAttribute('data-search-suggest-query');
      if (query) {
        applySearchQuery(query);
      }
      return;
    }

    const browseBtn = target.closest('[data-browse-queue-item]') as HTMLElement | null;
    if (browseBtn) {
      event.preventDefault();
      const contentId = browseBtn.getAttribute('data-browse-queue-item');
      if (contentId) {
        openSearchHit(contentId);
      }
      return;
    }

    const openBtn = target.closest('[data-open-search-hit]') as HTMLElement | null;
    if (!openBtn) {
      return;
    }
    event.preventDefault();
    const contentId = openBtn.getAttribute('data-open-search-hit');
    if (contentId) {
      openSearchHit(contentId);
    }
  });

  document.getElementById('regenCancel')?.addEventListener('click', () => {
    closeRegenModal();
  });
  document.getElementById('regenConfirm')?.addEventListener('click', () => {
    void submitRegenerate();
  });
  document.getElementById('regenModal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
      closeRegenModal();
    }
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

    const regenButton = target.closest('[data-regen-draft]') as HTMLElement | null;
    if (regenButton) {
      event.preventDefault();
      const contentId = regenButton.getAttribute('data-regen-draft');
      if (contentId && !state.regenerating.has(contentId)) {
        openRegenModal(contentId);
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
