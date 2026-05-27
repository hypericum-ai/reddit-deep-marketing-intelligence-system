# Hypericum Reddit Signal Radar (RSR)

Reddit Signal Radar is a **human-in-the-loop** intelligence system that runs inside Reddit. It watches relevant subreddits, detects posts where someone is describing a problem Hypericum solves, and produces **review-ready comment drafts** — without ever posting automatically.

The system does three things well:

1. **Finds** high-intent conversations in real time (and via scheduled subreddit scans)
2. **Understands** each post with structured AI insight and relevance scoring
3. **Drafts** practitioner-voice comments aligned to Hypericum’s positioning and tone rules

Reviewers work from a **native Reddit dashboard**: copy a draft, post manually on the thread, and track whether the comment was published via **engagement analytics**.

> **Design principle:** The AI does ~90% of the drafting work. A human always makes the final call before anything goes live.

---

## What the system does

| Capability | What it means for Hypericum |
|---|---|
| **Real-time signal capture** | New posts and comments in installed subreddits are processed instantly |
| **Intent scoring** | 150+ tuned phrases detect frustration, switching, discovery, and complaint signals |
| **Domain clustering** | Posts are tagged to Hypericum’s six problem domains (AI production failure, analytics reconciliation, etc.) |
| **AI insight cards** | Gemini extracts pain point, context, workaround, desired outcome, tone, and urgency |
| **Comment drafts** | Second AI pass writes a full Reddit comment with `direct` / `partial` / `none` relevance |
| **Duplicate detection** | Near-duplicate threads are flagged; reviewers are redirected to the canonical conversation |
| **Reviewer dashboard** | Custom Reddit post showing the live queue, drafts, filters, and engagement status |
| **Proactive monitor** | Scheduled scans of configured subreddits catch posts outside pure trigger coverage |
| **Engagement tracking** | Detects when a team member posted a draft (or close variant) on a thread |
| **Ranked opportunities** | Clusters are scored by frequency, urgency, engagement, and trend velocity |

---

### Core components

| Layer | Role | Technology |
|---|---|---|
| **Ingestion** | Captures posts, comments, edits | Devvit triggers (`onPostSubmit`, `onCommentSubmit`, `onPostUpdate`) |
| **Scoring** | Filters noise; scores marketing intent | Rule engine + category taxonomy (JSON config) |
| **Similarity** | Detects duplicate/near-duplicate threads | Heuristic overlap + Gemini embeddings |
| **Intelligence** | Structured understanding + drafts | Gemini 2.5 Flash (two separate calls per signal) |
| **Storage** | Signals, insights, drafts, engagement | Devvit Redis (90-day retention) |
| **Presentation** | Reviewer workflow | Custom Devvit post + REST API |
| **Automation** | Background jobs | Devvit scheduler (monitor every 2h, engagement every 1h) |


## How it works — end-to-end pipeline

```
Reddit post or comment submitted
        │
        ▼
[1] Devvit trigger fires instantly
        │
        ▼
[2] Preprocess — strip markdown, block spam, enforce min length
        │  (too short / spam → discarded)
        ▼
[3] Intent score — 150+ phrases, capped at 100
        │  (score < 30 → discarded)
        ▼
[4] Domain clusters assigned (Hypericum problem domains)
        │
        ├──────────────────────────────┐
        ▼                              ▼
[5a] Stored in Redis            [5b] Similarity check
     (signal + metadata)              (duplicate → redirect banner)
        │
        ▼ (async — does not block ingestion)
[6] Gemini call #1 — insight extraction
        │  pain point, context, workaround, urgency, tone, hook
        ▼
[7] Gemini call #2 — comment draft
        │  relevance (direct/partial/none), domain match, full draft text
        ▼
[8] Reviewer queue — dashboard + API
        │
        ▼
[9] Human reviews, copies draft, posts manually on Reddit
        │
        ▼
[10] Engagement scan matches posted comment to draft → status badge updates
```

### Intent scoring

| Score | Level | System action |
|---|---|---|
| 0–29 | Too low | Discarded |
| 30–69 | Medium | Saved; insight extracted; draft generated |
| 70–100 | High | Same — higher priority for human review |

### Hypericum domain clusters

Posts are tagged against problem domains aligned to Hypericum’s market positioning:

- **AI production failure** — RAG/LLM works in demo, fails in production
- **Analytics reconciliation** — conflicting metrics and definitions
- **Acquisition integration** — incompatible taxonomies post-merger
- **Multi-tenant SaaS AI** — AI features inconsistent across clients
- **Regulatory audit** — auditable classification requirements
- **Knowledge graph governance** — Neo4j/ontology drift without governance

### Duplicate handling

When two threads describe the same problem, RSR:

1. Detects overlap (title, text, clusters, intent phrases)
2. Marks the newer thread as **redirected**
3. Shows a banner on the dashboard: *“Reply on the existing thread instead”*
4. Suppresses a separate LLM draft for the duplicate (saves cost; avoids split conversations)
5. Still scans **both** thread URLs when checking engagement

---

### Moderator menu reference

| Menu item | Where | Purpose |
|---|---|---|
| **RSR: Create Review Dashboard** | Subreddit menu | Creates the reviewer dashboard post |
| **RSR: Check draft engagement** | Subreddit menu | Scans threads for posted draft matches |
| **RSR: Run subreddit monitor** | Subreddit menu | Manually triggers proactive subreddit scan |
| **RSR: Sync Dashboard** | Dashboard post menu | Re-embeds queue snapshot on the post (optional if live Refresh works) |
| **RSR: Dump signals to log** | Dashboard post menu | Debug export to playtest terminal |

---

## Engagement analytics — what “Posted” means

RSR does **not** auto-post. It **detects** when someone on your team posted a comment that matches a stored draft.

| Badge | Meaning |
|---|---|
| **Not posted yet** | No matching comment found on the thread (or related duplicate thread) |
| **Partial match** | Comment overlaps ≥15% (word similarity) with the draft |
| **Posted** | Comment overlaps ≥28% (word similarity) with the draft |

Matching runs:

- **On comment submit** (real-time trigger when possible)
- **On schedule** (hourly background scan)
- **On demand** (mod menu: Check draft engagement)

> **Note:** Similarity is measured by **word overlap (Jaccard)**, not character-by-character comparison.

---

## What has been built — phase status

| Phase | Description | Status |
|---|---|---|
| **1** | Event ingestion, Redis storage, subreddit config | ✅ Done |
| **2** | Preprocessing, intent scoring, clustering, ranking, API | ✅ Done |
| **3** | LLM insight extraction (Gemini 2.5 Flash) | ✅ Done |
| **4** | Hypericum domain tuning + comment draft generation | ✅ Done |
| **5** | Similarity detection + duplicate redirect | ✅ Done |
| **6** | Native Reddit reviewer dashboard | ✅ Done |
| **7** | Proactive subreddit monitor (scheduled + manual) | ✅ Done |
| **8** | Engagement analytics (draft vs posted comment) | ✅ Done |
| **9** | Copy draft, filters, dark/light mode, responsive layout | ✅ Done |

**Current playtest environment:** `r/hypericum_rsr_dev`  
**Automated tests:** 44 unit tests covering scoring, similarity, queue, drafts, and engagement

---

## API surface (for integrations)

Live HTTP endpoints (usable by external tools if exposed):

| Endpoint | Returns |
|---|---|
| `GET /api/signals` | Raw signals |
| `GET /api/aggregated-signals` | Signals grouped by cluster |
| `GET /api/ranked-opportunities` | Clusters ranked by opportunity score |
| `GET /api/comment-drafts` | Drafts with signal and insight context |
| `GET /api/comment-drafts?relevance=direct` | High-priority drafts only |
| `GET /api/reviewer-queue` | Full reviewer queue for dashboard |
| `GET /api/config` | Current subreddit configuration |

---

## What’s next

### Near term

| Item | Description | Priority |
|---|---|---|
| **Reddit app review & deploy** | Submit to Reddit; install on first production subreddits | High |
| **Target subreddit rollout** | `r/dataengineering`, `r/BusinessIntelligence`, `r/MachineLearning`, `r/SaaS`, `r/devops`, `r/dbt`, etc. | High |
| **Reviewer playbook** | Document who reviews, SLA for `direct` + high urgency, tone approval process | High |
| **Gemini cost monitoring** | Track API usage as volume scales | Medium |
| **Real-time alerting** | Slack/email/DM when a `direct` + `high` urgency signal arrives | High |
| **Comment performance metrics** | Track upvotes and replies on posted comments (not just “was it posted”) | Medium |
---

## Success metrics (suggested KPIs)

| Metric | What it tells you |
|---|---|
| **Signals captured / week** | Volume of relevant conversations detected |
| **`direct` relevance rate** | Quality of targeting — % of drafts where Hypericum is the natural answer |
| **Draft-to-post conversion** | % of drafts that reviewers actually posted |
| **Time to first response** | Hours from signal capture to human comment |
| **Comment engagement** | Upvotes and replies on posted comments |
| **Cluster trends** | Which Hypericum problem domains are heating up on Reddit |

---