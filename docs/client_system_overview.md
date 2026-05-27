# Reddit Signal Radar — System Overview for Hypericum

**Prepared for:** Hypericum  
**Status:** Phase 4 complete — live in playtest  
**Last updated:** May 2026

---

## What This System Does

The Reddit Signal Radar (RSR) is a custom intelligence tool that monitors Reddit in real time, identifies posts and threads where someone is describing a problem that Hypericum directly solves, and produces a ready-to-post comment draft for each one.

The end output — for every qualifying Reddit post — is:

1. A structured breakdown of the person's pain point, context, and what they want
2. A relevance assessment: how closely the post maps to Hypericum's expertise
3. A full comment draft, written in the voice of a knowledgeable practitioner, ready for human review and posting

The system does not post automatically. Every draft is reviewed before anything goes live. The goal is to surface the right conversations at the right moment and do 90% of the drafting work — the human makes the final call.

---

## How It Works — All Layers

### Layer 1: Event Ingestion

The system is installed on Reddit subreddits as a moderation app (built on Reddit's developer platform, Devvit). Every time someone submits a post or comment in a monitored subreddit, the system receives it instantly — no polling, no delay. This covers:

- New posts
- New comments
- Edited posts (updates the existing record)

The subreddits monitored are configured at setup time. Typical targets: `r/dataengineering`, `r/MachineLearning`, `r/SaaS`, `r/entrepreneur`, `r/devops`, `r/BusinessIntelligence`, `r/dataanalysis`.

---

### Layer 2: Preprocessing and Noise Filter

Every piece of content is cleaned before analysis:

- URLs, markdown formatting, and code blocks are stripped
- The text is lowercased and normalised
- Known spam phrases are blocked (`click here`, `dm me`, etc.)
- Content shorter than 40 characters or fewer than 5 meaningful words is discarded

This ensures only real, substantive posts reach the analysis stage.

---

### Layer 3: Intent Scoring

The cleaned text is scanned against a rule set of **150+ phrases** tuned to detect genuine pain, frustration, and active problem-solving. Each phrase carries a point value and an intent type.

**Intent types:**

| Type | What it catches |
|---|---|
| `frustration` | Someone is at their limit with a current situation |
| `complaint` | Active dissatisfaction with a tool, process, or outcome |
| `switching` | Looking for alternatives, migrating away from something |
| `discovery` | Actively seeking a solution, asking for recommendations |

**Example phrases that score highly:**

| Phrase | Points | Why it matters |
|---|---|---|
| "works in demo but" | 35 | Classic AI production failure signal |
| "inconsistent classifications" | 35 | Core Hypericum problem domain |
| "reconciling reports" | 35 | Analytics reconciliation domain |
| "taxonomy mismatch" | 35 | Post-acquisition integration domain |
| "works for some clients" | 32 | Multi-tenant SaaS AI domain |
| "different definitions" | 32 | Analytics reconciliation domain |
| "auditable classification" | 32 | Regulatory audit domain |
| "inconsistent in production" | 32 | AI production failure domain |
| "breaking point" | 35 | High-urgency frustration signal |

Points are additive. A post matching five phrases scores the sum. The score is capped at 100.

**Score thresholds:**

| Score | Level | Action |
|---|---|---|
| 0–29 | Too low | Discarded |
| 30–69 | Medium | Saved, LLM insight extracted |
| 70–100 | High | Saved, LLM insight extracted, comment draft generated |

---

### Layer 4: Domain Cluster Assignment

Every qualifying post is assigned to one or more topic clusters based on keyword matching. The clusters are now aligned with Hypericum's six core problem domains:

| Cluster | What it catches |
|---|---|
| `ai-production-failure` | RAG pipelines, LLM classification, hallucination, inconsistent AI outputs |
| `analytics-reconciliation` | Report discrepancies, metric definitions, "trust the data" problems |
| `acquisition-integration` | Incompatible taxonomies post-merger, product hierarchy mismatches |
| `multitenant-saas-ai` | SaaS vendors building AI across clients with different data models |
| `regulatory-audit` | Consumer Duty, GDPR, EU AI Act, audit trail, classification history |
| `knowledge-graph-governance` | Neo4j, ontology drift, taxonomy inconsistency, semantic layer |
| `manual-workflow` | Generic manual process pain (catch-all) |
| `integration-gaps` | Pipelines, connectors, data sync issues |

A single post can match multiple clusters simultaneously.

---

### Layer 5A: Signal Storage

Every qualifying signal is stored in Redis with:

- The full post content
- Intent score, level, and matched phrases
- Assigned clusters
- Engagement metrics (upvotes, comment count)
- A direct permalink back to the Reddit post

Signals are retained for 90 days. The system maintains up to 500 signals per query.

---

### Layer 5B: LLM Insight Extraction (First AI Call)

For every signal that scores 30 or above, the system makes a call to **Gemini 2.5 Flash** to extract structured intelligence from the post. This runs asynchronously — it does not slow down the ingestion pipeline.

**What is extracted per post:**

| Field | Description |
|---|---|
| Pain point | The core problem in one clear sentence |
| User context | Who this person is and their situation |
| Current workaround | How they are solving the problem today |
| Desired solution | What they actually want |
| Emotional tone | `frustrated / annoyed / curious / desperate / hopeful / neutral` |
| Urgency | `high / medium / low` |
| Marketing hook | A one-line hook capturing this person's specific need |

This insight is stored alongside the signal and used as input for the next stage.

---

### Layer 5C: Comment Draft Generation (Second AI Call)

For every signal that has an insight, the system makes a second call to **Gemini 2.5 Flash** — this time with the full Hypericum briefing embedded as context.

The model is instructed to:

1. Assess how closely the post maps to one of Hypericum's six problem domains
2. Determine whether Hypericum should be mentioned, and how prominently
3. Draft a full comment in plain prose, written as a knowledgeable practitioner — not as a product advertiser
4. Flag anything a human reviewer should adjust before posting

**What the draft includes:**

| Field | Description |
|---|---|
| Relevance | `direct` — Hypericum is the natural answer; `partial` — Hypericum is one useful option; `none` — not relevant, comment answers the question without mentioning Hypericum |
| Relevance reason | One sentence explaining the relevance assessment |
| Domain match | Which of the 6 Hypericum problem domains this post maps to |
| Draft | The full comment text, ready for review and posting |
| Posting guidance | Notes for the human reviewer — suggested edits, tone caveats, things to double-check |

**Rules the AI follows when drafting:**

- Mention Hypericum only where it is the natural answer to an explicitly described problem
- Never use promotional language or sales copy
- Never explain internal mechanics of how Hypericum works (patent pending protection applied)
- Write as a practitioner in a real technical conversation, not as a marketer
- Lead with the genuine answer to the question; Hypericum is cited where it fits, not inserted
- If Hypericum is not relevant, the comment is still useful — it answers the question as a knowledgeable contributor
- Comments are 3–6 paragraphs of flowing prose — no bullet points, no filler phrases

---

### Layer 6: Aggregation and Opportunity Ranking

All signals are grouped by cluster. Each cluster is scored on four dimensions:

| Weight | Dimension | What it measures |
|---|---|---|
| 40% | Frequency | Volume of posts — proves the pain is recurring |
| 30% | Intent / urgency | How intensely people are suffering |
| 20% | Engagement | Upvotes and comment counts — measures community resonance |
| 10% | Trend velocity | How many signals are recent — measures timing relevance |

The result is a ranked list of the clusters generating the most opportunity right now. This tells you which problem domains are currently most active on Reddit.

---

### Layer 7: Export and Review

**Mod menu dump:** A moderator menu action collects all signals, runs any missing insight and draft extractions (backfill), and prints the full output to the development terminal.

**Local JSON export:** Running `npm run export` saves a timestamped JSON file containing:
- Every signal with its full metadata
- The LLM insight card for each signal
- The comment draft for each signal
- The ranked opportunity list

**REST API:** The system exposes live endpoints:

| Endpoint | Returns |
|---|---|
| `GET /api/signals` | All raw signals |
| `GET /api/aggregated-signals` | Signals grouped by cluster |
| `GET /api/ranked-opportunities` | Clusters ranked by opportunity score |
| `GET /api/comment-drafts` | All drafts with signal and insight context |
| `GET /api/comment-drafts?relevance=direct` | Only posts where Hypericum is the direct answer |
| `GET /api/config` | Current subreddit configuration |

---

## The Full Pipeline in One View

```
Reddit post / comment submitted
        │
        ▼
[Layer 1] Ingested instantly via Devvit trigger
        │
        ▼
[Layer 2] Cleaned, spam-filtered, length-checked
        │  too short / spam → discarded
        ▼
[Layer 3] Intent scored against 150+ phrases
        │  score < 30 → discarded
        ▼
[Layer 4] Assigned to Hypericum domain clusters
        │
        ├─────────────────────────────────────────┐
        ▼                                         ▼ (async, non-blocking)
[Layer 5A] Stored in Redis              [Layer 5B] Gemini call #1
           90-day TTL                              → Extracts insight:
           Signal + clusters                         pain point, context,
           + engagement                              workaround, desired
           + permalink                               solution, tone, urgency
                                                     marketing hook
                                                  │
                                                  ▼
                                        [Layer 5C] Gemini call #2
                                                   → Drafts comment:
                                                     relevance assessment
                                                     domain match
                                                     full comment text
                                                     posting guidance
        │
        ▼
[Layer 6] Clusters aggregated + ranked by opportunity score
        │
        ▼
[Layer 7] Available via REST API, mod dump, and JSON export
          → Human reviews drafts and posts the best ones
```

---

## What Has Been Built (Phase Status)

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Event ingestion, Redis storage, subreddit config | Done |
| Phase 2 | Preprocessing, intent scoring, clustering, aggregation, ranking, API | Done |
| Phase 3 | LLM insight extraction (Gemini 2.5 Flash) | Done |
| Phase 4 | Hypericum domain tuning + comment draft generation | Done |

---

## What Is Next

### Phase 5-A: Deploy to real subreddits
Submit the Devvit app for Reddit's app review process and install it on the subreddits where Hypericum's target audience is active:

- `r/dataengineering`
- `r/BusinessIntelligence`
- `r/MachineLearning`
- `r/SaaS`
- `r/devops`
- `r/entrepreneur`
- `r/dataanalysis`
- `r/Palantir` (for competitive positioning)
- `r/dbt` (for positioning vs. metric governance tools)

This requires a Reddit account with moderator access to these subreddits, or working with subreddit moderators to install the app.

### Phase 5-B: Native Reddit dashboard UI
A custom interface embedded directly in Reddit (built using Devvit's UI framework) showing live ranked opportunities and comment draft cards — no terminal required. The reviewer sees the post, the insight, the draft, and can copy it in one click.

### Phase 5-C: Proactive subreddit search
The current system is passive — it only sees new content in subreddits where it's already installed. A proactive search layer would query Reddit's search API on a schedule for specific keywords matching Hypericum's six problem domains, expanding coverage beyond installed subreddits. This catches high-value historical posts and conversations in communities where Hypericum isn't yet a moderator.

### Phase 5-D: Real-time alerting
A webhook or direct message notification fires whenever a `high` urgency signal is saved with `direct` relevance — meaning someone is actively and urgently describing an exact Hypericum problem right now. This ensures high-priority opportunities are reviewed within hours, not days.

### Phase 5-E: Engagement analytics
Track which posts received a comment (posted externally by the team), and measure the response: upvotes, replies, profile visits. Closes the loop between signal detection and actual community impact.

---

## Configuration

The system's behaviour per subreddit is adjustable without redeployment:

| Setting | Default | What it controls |
|---|---|---|
| `minIntentScore` | 30 | Minimum score to store a signal |
| `minTextLength` | 40 | Minimum character length after cleaning |
| `enabledCategories` | `*` (all) | Which domain clusters to monitor |
| `geminiApiKey` | — | Google AI Studio key for LLM calls |

---

## Key Design Decisions

**Two separate AI calls, not one.** The insight extraction and the comment drafting are deliberately separated. The first call focuses purely on understanding the post — no knowledge of Hypericum, no agenda. The second call focuses purely on response — with full Hypericum context. This separation produces more accurate insights and better-grounded drafts than combining both tasks into one prompt.

**Relevance is explicit and three-valued.** Every draft carries a `direct / partial / none` relevance label. This means a human reviewer can filter instantly to only the posts where Hypericum is the most direct answer, without reading every draft.

**The briefing is embedded, not fetched.** The full Hypericum product context — what it is, what it solves, how it differs from competitors, and the rules for engagement — is embedded directly into the comment drafting prompt. This means the AI has complete and consistent context every time, with no dependency on external files or APIs.

**Immutable signals.** Once a signal is stored, the original post content is never modified. If a post is edited on Reddit, the system creates an updated record but the original is preserved. This means the insight and draft always reflect a specific, known version of the post.

**Fire-and-forget LLM calls.** Neither the insight extraction nor the comment drafting blocks the ingestion pipeline. If an AI call fails, the signal is still stored. A backfill mechanism runs whenever the dump action is triggered, so no signal permanently misses its draft.
