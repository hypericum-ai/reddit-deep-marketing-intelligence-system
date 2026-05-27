# Reddit Signal Radar (RSR): Devvit-Native Architecture

## Core Objective
Instead of pulling Reddit data into an external pipeline, **Reddit Signal Radar (RSR)** runs intelligence extraction directly inside Reddit's ecosystem. This approach leverages Devvit-native hooks to process events in real-time, generating insights in-place and aggregating opportunities within a Reddit app dashboard.

---

## 1. High-Level Architecture

```
Reddit Post/Comment Event
          ↓
Devvit Trigger Handler
          ↓
Lightweight Text Preprocessing
          ↓
On-platform Scoring Engine (rules + embeddings optional)
          ↓
LLM Insight Extraction (optional / batch / selective)
          ↓
Devvit KV Storage (signals + aggregated trends)
          ↓
Dashboard UI (Devvit Panel / Sidebar App)
          ↓
Opportunity Feed + Alerts

```

---

##  2. System Components

### 2.1 Event-Driven Data Capture (Native Hooks)
No API polling or PRAW ingestion required. The system uses Devvit-native hooks to capture interactions as they happen:
- `onPostSubmit`: Triggers when a new post is created.
- `onCommentSubmit`: Triggers when a new comment is added.
- `onPostUpdate`: Captures edits or moderation changes.

**Output:** Real-time event objects containing `id`, `type`, `subreddit`, `text`, `author`, and `timestamp`.

### 2.2 Lightweight Preprocessing Layer
Runs within the Devvit sandbox to ensure fast filtering at the edge:
- **Noise Reduction:** Remove spam or posts below a length threshold.
- **Normalization:** Strip markdown, normalize casing.
- **Token Extraction:** Fast regex-based keyword/token detection.

### 2.3 Intent Detection Engine (Hybrid Rules + LLM)
A tiered approach to minimize latency and cost:
- **Tier 1 (Rule-based):** Immediate scoring based on high-signal phrases (e.g., "how do I fix", "alternatives to", "problem with").
- **Tier 2 (Embeddings):** Optional lightweight model to detect frustration or switching intent.
- **Tier 3 (LLM):** Triggered only for posts exceeding an `intent_score` threshold (e.g., > 70).

### 2.4 Insight Extraction Layer (Selective LLM)
Only high-value posts undergo deep LLM analysis to extract:
- **Pain Point:** The core problem.
- **Context:** User background and situation.
- **Workaround:** Current sub-optimal solutions.
- **Desired Solution:** What the user actually wants.
- **Emotional Tone & Urgency:** Frustration levels and time sensitivity.

### 2.5 Opportunity Aggregation (Devvit KV Store)
Uses `Devvit KV Store` for state management instead of an external database:
- **Clustering:** Group similar pain points.
- **Counters:** Track frequency and trend velocity.
- **Buckets:** Subreddit-level aggregation.

### 2.6 Ranking Engine
Scores opportunities based on:
- `opportunity_score = (frequency * 0.4) + (urgency * 0.3) + (engagement * 0.2) + (trend_velocity * 0.1)`

### 2.7 Output Layer (Reddit-Native UI)
A dashboard built using Devvit UI components:
- **Views:** "Top Pain Points Today", "Rising Problems", "High Intent Posts".
- **Alerts:** Push notifications for high-priority signals.

---

##  3. Devvit Advantage vs. External Pipeline

| Feature | Original (External) | Devvit Native (RSR) |
| :--- | :--- | :--- |
| **Ingestion** | API Polling (PRAW) | Event-driven Triggers |
| **Processing** | Batch Pipelines | Real-time Edge Processing |
| **Infrastructure** | ETL + SQL + Redis | Devvit KV Storage |
| **UI** | External Dashboard | Reddit-Native Panel |
| **Cost** | High Infra + API Costs | Minimal / Native |

---

## 🚀 4. Advanced Extensions
- **Market Intelligence Bot:** Installable by mods to monitor subreddits.
- **Auto-Insight Commenter:** (Optional) Suggests solutions or mentions common pain points.
- **Cross-Subreddit Radar:** Identify demand signals across communities (e.g., r/SaaS + r/startups).
- **Opportunity Alerts:** Native Reddit push notifications for detected trends.

---

## ⚖️ 5. Tradeoffs
- **Pros:** Zero external infra, real-time by default, native distribution.
- **Constraints:** Limited compute sandbox, KV store limitations, selective LLM usage required.


reference:
https://bigideasdb.com/reddit-pipeline-builder-for-startup-ideas