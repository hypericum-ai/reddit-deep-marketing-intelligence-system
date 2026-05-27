# Reddit Signal Radar (RSR) — System Documentation

**App name:** `hypericum-rsr`  
**Platform:** Devvit (Reddit Developer Platform)  
**Runtime:** Node.js ≥ 22.2.0, TypeScript (ESM)  
**Status:** Phase 3 complete — live in playtest

---

## 1. What the System Does

The Reddit Signal Radar (RSR) is a Devvit app that passively monitors Reddit posts and comments in real time. Every new piece of content is run through a multi-stage pipeline:

1. **Ingest** — Devvit triggers fire on every post/comment submitted or edited
2. **Filter** — Spam detection and minimum length/token checks remove noise
3. **Score** — Rule-based intent scoring detects frustration, switching intent, complaints, and discovery signals
4. **Cluster** — Keyword matching assigns each signal to one or more named pain-point buckets
5. **Store** — Qualifying signals are persisted in Devvit Redis with 90-day TTL
6. **Extract** — High-value signals (score ≥ 30) are enriched with structured LLM insights via Gemini 2.5 Flash
7. **Rank** — All clusters are scored using a weighted opportunity formula
8. **Export** — A mod menu action dumps everything to the playtest terminal; a local script saves it to a timestamped JSON file

The end output is a ranked list of market opportunities with per-signal LLM insight cards: pain point, user context, current workaround, desired solution, emotional tone, urgency, and a marketing hook.
---

## System Architecture

```
+------------------------------------------------------------------+
|                       REDDIT PLATFORM                           |
|           New Post  ·  New Comment  ·  Post Edit (live)         |
+--------------------------------+---------------------------------+
                                 |
                    Devvit triggers fire instantly
                                 |
+--------------------------------+---------------------------------+
|              LAYER 1  —  INGESTION                              |
|   onPostSubmit  ·  onCommentSubmit  ·  onPostUpdate             |
|   Normalize raw event body  →  ContentEventInput                |
+--------------------------------+---------------------------------+
                                 |
+--------------------------------+---------------------------------+
|              LAYER 2  —  PREPROCESSING & FILTER                 |
|   · Strip URLs, markdown, code blocks, punctuation              |
|   · Spam detection   (blocklist phrases)          → REJECTED    |
|   · Min length check (default: 40 chars)          → REJECTED    |
|   · Min token check  (default: 5 words)           → REJECTED    |
+--------------------------------+---------------------------------+
                                 |  clean text passes
                                 |
+--------------------------------+---------------------------------+
|              LAYER 3  —  INTENT SCORING                         |
|   · Scan text against 55+ rule phrases (additive points)        |
|   · Score 0–39 = low  |  40–69 = medium  |  70–100 = high       |
|   · Type: frustration · switching · discovery · complaint        |
|   · score < minIntentScore (default: 30)          → REJECTED    |
+--------------------------------+---------------------------------+
                                 |  score ≥ 30 passes
                                 |
+--------------------------------+---------------------------------+
|              LAYER 4  —  CLUSTER ASSIGNMENT                     |
|   Pass 1 — keyword match → topic cluster                        |
|     spreadsheet-fatigue · devtools-pain · saas-subscriptions    |
|     manual-workflow · reporting-automation · integration-gaps   |
|   Pass 2 — intent type → intent cluster                         |
|     frustration-signals · switching-intent · solution-seeking   |
+----------------+------------------------+------------------------+
                 |                        |
     saved to Redis             async — non-blocking
                 |                        |
+---------------+---------+  +-----------+--------------------+
|  LAYER 5A  —  STORAGE   |  |  LAYER 5B  —  LLM EXTRACTION  |
|  (Devvit Redis)         |  |  (Gemini 2.5 Flash API)        |
|                         |  |                                |
|  rsr:signal:{id}        |  |  Fires when score ≥ 30         |
|    Full Signal JSON     |  |  and Gemini API key is set     |
|    90-day auto-expire   |  |                                |
|                         |  |  Extracts per signal:          |
|  rsr:signals:recent     |  |   · pain point                 |
|    Sorted set (newest)  |  |   · user context               |
|                         |  |   · current workaround         |
|  rsr:signals:sub:{sub}  |  |   · desired solution           |
|    Per-subreddit index  |  |   · emotional tone             |
|                         |  |   · urgency level              |
|  rsr:config:{sub}       |  |   · marketing hook             |
|    Subreddit settings   |  |                                |
|                         |  |  Saved → rsr:insight:{id}      |
|                         |  |  90-day auto-expire            |
+-------------------------+  +--------------------------------+
                 |                        |
                 +----------+-------------+
                            |
+---------------------------+---------------------------+
|          LAYER 6  —  AGGREGATION & RANKING            |
|   · Group all signals by cluster                      |
|   · Per cluster: frequency · avgIntent · trendVelocity|
|   · Opportunity score =                               |
|       frequency   × 0.40  (volume)                    |
|     + intent      × 0.30  (pain intensity)            |
|     + engagement  × 0.20  (community resonance)       |
|     + trend       × 0.10  (recency)                   |
|   · Ranked list sorted highest → lowest               |
+---------------------------+---------------------------+
                            |
          +-----------------+-----------------+
          |                 |                 |
+---------+------+  +-------+-------+  +------+--------+
|  REST API      |  |  MOD MENU     |  |  LOCAL EXPORT  |
|                |  |  DUMP         |  |                |
| /api/signals   |  |  · Backfill   |  | exports/*.json |
| /api/ranked-   |  |    LLM on old |  | (npm run       |
|   opportunities|  |    signals    |  |  export)       |
| /api/config    |  |  · Print to   |  |                |
|                |  |    terminal   |  |                |
+----------------+  +---------------+  +----------------+
```

---

## 2. Data Pipeline — Step by Step

### Step 1: Event Ingestion

Three Devvit triggers fire automatically:

| Trigger | Route | When |
|---|---|---|
| `onAppInstall` | `/internal/triggers/on-app-install` | App installed on a subreddit — initializes default config in Redis |
| `onPostSubmit` | `/internal/triggers/on-post-submit` | New post submitted |
| `onCommentSubmit` | `/internal/triggers/on-comment-submit` | New comment submitted |
| `onPostUpdate` | `/internal/triggers/on-post-update` | Post edited (updates existing signal) |

Each event body is normalized by `eventMappers.ts` into a common `ContentEventInput`:

```typescript
type ContentEventInput = {
  contentId: string;        // Reddit thing ID, e.g. t3_abc123
  contentType: 'post' | 'comment';
  eventType: 'submit' | 'update';
  subreddit: string;
  author: string;
  title?: string;           // post only
  text: string;             // full raw body
  createdAt: number;        // unix ms
  engagement: { score: number; numComments?: number };
  permalink?: string;
};
```

### Step 2: Preprocessing (`src/core/preprocess.ts`)

Raw text is cleaned before any analysis:

- Strip URLs (`http...`)
- Strip markdown code blocks (` ``` `)
- Strip inline code, markdown formatting (`#`, `*`, `_`, `~`, `>`)
- Normalize whitespace
- Lowercase everything

Then three checks:

| Check | Rule | Action if triggered |
|---|---|---|
| Spam | Any phrase from `intentRules.spamPhrases` found in clean text | Signal ignored |
| Too short (chars) | `cleanText.length < minTextLength` (configurable, default 40) | Signal ignored |
| Too short (tokens) | Non-stop-word token count < `minTokenCount` (default 5) | Signal ignored |

### Step 3: Intent Scoring (`src/core/intentScoring.ts`)

Scans the clean text for every phrase in `intentRules.json`. Points are additive and **capped at 100**.

**Current rule set (selected examples):**

| Category | Phrase | Points | Intent Type |
|---|---|---|---|
| Frustration | `"breaking point"` | 35 | frustration |
| Frustration | `"frustrated"` | 30 | frustration |
| Frustration | `"killing my"` | 28 | frustration |
| Frustration | `"hate using"` | 35 | frustration |
| Complaint | `"broken"` | 22 | complaint |
| Complaint | `"constantly"` | 18 | complaint |
| Complaint | `"manually"` | 18 | complaint |
| Switching | `"switching from"` | 28 | switching |
| Switching | `"alternative to"` | 25 | switching |
| Switching | `"ditched"` | 25 | switching |
| Discovery | `"any better way"` | 25 | discovery |
| Discovery | `"what do you use for"` | 22 | discovery |
| Discovery | `"any recommendations"` | 18 | discovery |

**How the final score is computed:**

```
1. score = 0, topType = "general", topTypePoints = 0

2. For every rule in intentRules.json:
      if rule.phrase is found anywhere in cleanText:
          score += rule.points
          add rule.phrase to matchedSignals[]
          if rule.points > topTypePoints:
              topType      = rule.intentType   ← highest single-rule points wins
              topTypePoints = rule.points

3. finalScore  = min(score, 100)              ← hard ceiling
4. intentType  = topType  (or "general" if nothing matched)
5. level       = high  if finalScore >= 70
               = medium if finalScore >= 40
               = low   otherwise
```

Points are **additive** — every matched phrase contributes. A post matching five medium phrases (5 × 20 = 100) scores the same as one matching two strong ones (35 + 28 = 63 → lower). The `intentType` is **not** the most-frequent category — it is the category of the **single rule that awarded the most points**. So one 35-point `frustration` rule beats five 15-point `complaint` rules when deciding the label.

**Worked example:**

> *"frustrated with our saas billing — any alternative to manual spreadsheet tracking"*

| Phrase matched | Points | Intent type |
|---|---|---|
| `frustrated` | 30 | frustration |
| `alternative to` | 25 | switching |
| `manual process` | 20 | complaint |
| `spreadsheet` | 15 | complaint |
| `what do you use for` | 22 | discovery |

```
Raw total  = 30 + 25 + 20 + 15 + 22 = 112
Capped     = min(112, 100) = 100
Level      = high   (100 ≥ 70)
intentType = "frustration"  ← "frustrated" had the single highest points (30)
```

**Score levels:**

| Score | Level |
|---|---|
| 0–39 | low |
| 40–69 | medium |
| 70–100 | high |

**Output (`IntentResult`):**

```typescript
{
  score: number;            // 0–100, capped
  level: 'low' | 'medium' | 'high';
  intentType: 'frustration' | 'switching' | 'discovery' | 'complaint' | 'general';
  matchedSignals: string[]; // list of matched phrases
}
```

The dominant `intentType` is whichever category contributed the most points.

### Step 4: Cluster Assignment (`src/core/clustering.ts`)

Two passes:

**Pass 1 — Keyword matching** against `categories.json`:

| Cluster slug | Keywords |
|---|---|
| `spreadsheet-fatigue` | spreadsheet, excel, google sheets, csv export |
| `manual-workflow` | manual, workflow, copy paste, tedious |
| `reporting-automation` | reporting, dashboard, analytics, bi tool |
| `devtools-pain` | api, sdk, deploy, ci cd, cicd, debugging |
| `saas-subscriptions` | subscription, billing, pricing, saas, per seat |
| `integration-gaps` | integration, zapier, webhook, sync, connector |

**Pass 2 — Intent-type cluster** always added if any phrase matched:

| Intent type | Cluster added |
|---|---|
| frustration | `frustration-signals` |
| switching | `switching-intent` |
| discovery | `solution-seeking` |
| complaint | `pain-complaints` |

**Fallback** — If zero clusters matched, 3 significant tokens from the text form a `topic:{token1}-{token2}-{token3}` cluster.

A signal can belong to **multiple clusters** simultaneously.

### Step 5: Redis Storage (`src/storage/redisSignalStore.ts`)

Each signal is stored under three Redis keys:

| Key pattern | Type | Purpose |
|---|---|---|
| `rsr:signal:{contentId}` | String (JSON) | Full signal payload, 90-day TTL |
| `rsr:signals:recent` | Sorted Set | All signals, scored by `updatedAt` — used for global listing |
| `rsr:signals:sub:{subreddit}` | Sorted Set | Per-subreddit index, same score |

**Idempotency:** `onPostSubmit` is skipped if the `contentId` already exists. `onPostUpdate` uses `allowUpdate: true` to overwrite.

**List query** (`listSignals`): fetches the top N content IDs from the sorted set (newest first), then bulk-fetches all payloads with `mGet`.

Maximum stored: 500 signals per query (hard cap).

### Step 6: LLM Insight Extraction (`src/core/llmExtraction.ts`)

Fires **asynchronously** (fire-and-forget) after a signal is saved, if `intent.score >= 30` and a Gemini API key is configured.

**Model:** `gemini-2.5-flash` with `thinkingBudget: 0` (thinking disabled — faster, cheaper, produces plain JSON output).

**API endpoint:**
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={KEY}
```

**Prompt structure:** Sends the post title + up to 1,500 characters of body, requests a JSON object with 7 fields.

**Output (`LLMInsight`):**

```typescript
{
  contentId: string;
  extractedAt: number;          // unix ms
  model: string;                // "gemini-2.5-flash"
  painPoint: string;            // Core problem in one sentence
  userContext: string;          // Who the user is and their situation
  currentWorkaround: string;    // How they solve this today
  desiredSolution: string;      // What they actually want
  emotionalTone: 'frustrated' | 'annoyed' | 'curious' | 'desperate' | 'hopeful' | 'neutral';
  urgency: 'high' | 'medium' | 'low';
  marketingHook: string;        // One-line marketing copy hook
}
```

Stored under `rsr:insight:{contentId}` in Redis (90-day TTL). **Never extracted twice** — `insightExists()` check prevents re-calls.

**Timeout:** 20 seconds per call. Errors are logged and silently skipped (never crash the trigger).

**Backfill:** When the mod clicks "RSR: Dump signals to log", the menu handler runs LLM extraction for any existing signal that doesn't yet have an insight. This catches signals that were saved before the LLM feature was deployed.

### Step 7: Aggregation (`src/core/aggregateSignals.ts`)

Groups all signals by cluster. For each cluster computes:

| Field | Formula |
|---|---|
| `frequency` | Count of signals in cluster |
| `avgIntent` | Mean of `signal.intent.score` across all cluster members |
| `avgEngagement` | Mean of `signal.engagement.score` across all cluster members |
| `recentCount24h` | Count of signals created in the last 24 hours |
| `trendVelocity` | `min(1, recentCount24h / frequency)` — 1.0 = fully trending, 0 = all old |

Respects `enabledCategories` subreddit config — filters out disallowed clusters.

### Step 8: Opportunity Ranking (`src/core/rankOpportunities.ts`)

Each cluster's raw stats are normalized against ceiling values then combined:

```
frequencyScore   = min(100, frequency / 50 × 100)       ceiling: 50 signals
urgency          = min(100, avgIntent / 100 × 100)       ceiling: 100 intent points
engagementScore  = min(100, avgEngagement / 500 × 100)   ceiling: 500 upvotes
trendScore       = min(100, trendVelocity / 1 × 100)     ceiling: 1.0

opportunityScore = round(
  frequencyScore × 0.40 +
  urgency        × 0.30 +
  engagementScore× 0.20 +
  trendScore     × 0.10
)
```

**Weight rationale:**

| Weight | Component | Why |
|---|---|---|
| 40% | Frequency | Volume = proven, recurring pain |
| 30% | Intent / urgency | Intensity of suffering = buyer motivation |
| 20% | Engagement | Community resonance = market size signal |
| 10% | Trend velocity | Recency = timing relevance |

Output is sorted descending by `opportunityScore`.

---

## 4. Configuration

### Per-subreddit settings (set via Reddit app settings UI)

| Key | Type | Default | Description |
|---|---|---|---|
| `minIntentScore` | number | `30` | Ignore signals scoring below this |
| `minTextLength` | number | `40` | Ignore content shorter than this many chars after cleanup |
| `enabledCategories` | string | `"*"` | Comma-separated cluster slugs to include, or `*` for all |
| `geminiApiKey` | string | `""` | Google AI Studio API key for LLM extraction |

Settings are stored in Devvit's native settings system and merged with Redis-stored overrides on each request.

### Config files

**`src/config/intentRules.json`** — edit to add/tune intent phrases:
```json
{
  "rules": [
    { "phrase": "breaking point", "points": 35, "intentType": "frustration" }
  ],
  "spamPhrases": ["click here", "dm me"],
  "minTokenCount": 5
}
```

**`src/config/categories.json`** — edit to add topic clusters:
```json
{
  "categories": [
    { "slug": "devtools-pain", "keywords": ["api", "sdk", "deploy"] }
  ]
}
```

Both files are compiled into the bundle at build time (no runtime file I/O).

---

## 5. API Endpoints

All endpoints are served by the Hono app on `/api/*`.

| Method | Path | Query params | Returns |
|---|---|---|---|
| GET | `/api/signals` | `subreddit?`, `limit?` | Raw signals array |
| GET | `/api/aggregated-signals` | `subreddit?`, `limit?` | Clusters with stats |
| GET | `/api/ranked-opportunities` | `subreddit?`, `limit?` | Sorted opportunity list |
| GET | `/api/config` | `subreddit` (required) | Merged subreddit config |

Internal routes (Devvit-only, not public):

| Method | Path | Handler |
|---|---|---|
| POST | `/internal/triggers/on-app-install` | Init subreddit config |
| POST | `/internal/triggers/on-post-submit` | Ingest new post |
| POST | `/internal/triggers/on-comment-submit` | Ingest new comment |
| POST | `/internal/triggers/on-post-update` | Update existing post signal |
| POST | `/internal/menu/dump-signals` | Mod menu: dump + backfill + export |

---

## 6. Permissions (`devvit.json`)

```json
"permissions": {
  "reddit": true,
  "redis": true,
  "http": {
    "enable": true,
    "domains": ["generativelanguage.googleapis.com"]
  }
}
```

---

## 7. Development Workflow

### Prerequisites
```bash
nvm use 22          # Node 22+ required
npm install         # in hypericum-rsr/
devvit login        # authenticate with Reddit account
```

### Run playtest
```bash
npm run dev
# opens: https://www.reddit.com/r/hypericum_rsr_dev/?playtest=hypericum-rsr
```

### Export signals to local file
```bash
# In a second terminal, after clicking "RSR: Dump signals to log" on any post:
npm run export
# Saves to: exports/signals-{timestamp}.json
```

### Type check
```bash
npx tsc --noEmit
```

### Run tests
```bash
npm test
# 8 tests across: preprocess, intentScoring, aggregateSignals, rankOpportunities
```

### Deploy
```bash
npm run deploy      # type-check + lint + test + devvit upload
npm run launch      # deploy + devvit publish (production)
```

---

## 8. Redis Key Schema

| Key pattern | Type | Content | TTL |
|---|---|---|---|
| `rsr:signal:{contentId}` | String | `Signal` JSON | 90 days |
| `rsr:signals:recent` | Sorted Set | contentId → updatedAt score | No TTL |
| `rsr:signals:sub:{subreddit}` | Sorted Set | contentId → updatedAt score | No TTL |
| `rsr:insight:{contentId}` | String | `LLMInsight` JSON | 90 days |
| `rsr:config:{subreddit}` | String | `SubredditConfig` JSON | No TTL |

---

## 9. Current Status

### Completed

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Types, Redis storage, subreddit config, event triggers | Done |
| Phase 2 | Preprocessing, intent scoring, clustering, aggregation, ranking, API endpoints | Done |
| Phase 3 | LLM insight extraction (Gemini 2.5 Flash), insight storage, backfill on dump | Done |

### Verified in playtest

- 8 signals captured across all intent types
- All 8 enriched with LLM insights (pain point, context, workaround, solution, tone, urgency, hook)
- Ranked opportunities output: `devtools-pain` (score=42), `manual-workflow` (score=41), `solution-seeking` (score=41)
- Local export confirmed working via `npm run export`

### Known limitations

| Limitation | Notes |
|---|---|
| Engagement ceiling is 500 | Test posts have score=1, so engagement contributes ~0 to opportunity score. Real subreddit data will normalize this |
| No deduplication of near-identical posts | Same title posted twice creates two signals with independent scoring |
| No comment threading context | Comments are scored independently, not in the context of their parent post |
| LLM is fire-and-forget | If the Devvit sandbox restarts between signal save and LLM call, the insight may not be written. Backfill on next dump covers this |

---

## 10. Planned Next Phases

| Phase | Option | Description |
|---|---|---|
| Phase 4-A | Deploy to real subreddits | Submit for Devvit app review; install on `r/SaaS`, `r/entrepreneur`, `r/devops` |
| Phase 4-B | Native Reddit dashboard UI | Devvit custom post showing live ranked opportunities + insight cards |
| Phase 4-C | Python analysis notebook | Export JSON → topic clustering, keyword heatmaps, positioning briefs |
| Phase 4-D | Real-time alerting | Webhook/DM when `urgency=high` signal saved |
