# Reddit Signal Radar (RSR)

An AI-powered, Devvit-native intelligence layer that transforms Reddit discussions into structured marketing insights in real time.

The active application lives in [`hypericum-rsr/`](./hypericum-rsr/). A legacy PRAW batch-ingestion prototype is kept under [`legacy/ingestion/`](./legacy/ingestion/) for reference only.

## Architecture

The system runs inside Reddit via [Devvit](https://developers.reddit.com/):

1. **Event capture** — `onPostSubmit`, `onCommentSubmit`, `onPostUpdate`
2. **Intent scoring** — rule-based filtering and clustering
3. **LLM pipeline** — Gemini insight extraction (score ≥ 30) and comment drafts (score ≥ 70, on-domain)
4. **Reviewer dashboard** — native custom post with queue, filters, and copy-draft actions

See [docs/devvit_architecture.md](./docs/devvit_architecture.md) and [docs/client_system_overview.md](./docs/client_system_overview.md) for full design docs.

## Quick start (Devvit app)

```bash
cd hypericum-rsr
npm install
npm run login          # Reddit Devvit CLI
npm run dev            # playtest on r/hypericum_rsr_dev
```

In **Mod tools → Hypericum RSR → Settings**, set:

- **Gemini API Key** — from [Google AI Studio](https://aistudio.google.com/)
- **Monitor subreddits** — leave empty for eval, or comma-separated subs to poll

Useful commands (from `hypericum-rsr/`):

| Command | Purpose |
|---------|---------|
| `npm run test` | Unit tests |
| `npm run sync-prompts` | Regenerate `src/generated/llmPrompts.ts` from `prompts/` |
| `npm run preview-test-post` | Local scoring preview for eval post |
| `npm run export` | Save filtered signal dump from playtest terminal to `exports/` |

Mod menu actions on the dev subreddit include **Create Review Dashboard**, **Purge stale LLM data**, and **Dump signals to log**.

## Project structure

```
hypericum-rsr/          Devvit app (main product)
  prompts/              LLM prompts + llm-config.json (source of truth)
  scripts/              sync-prompts, export, preview-test-post
  src/                  TypeScript source + generated llmPrompts.ts
  devvit.json           App config, triggers, mod menu, settings
docs/                   Architecture and client documentation
legacy/ingestion/       Deprecated PRAW batch CLI (incomplete)
```

## Configuration

Prompts and thresholds are edited in `hypericum-rsr/prompts/`:

- `llm-config.json` — word limits, score thresholds, export cutoff
- `insight-extraction.prompt.txt` — Call 1 (Hypericum-free insight)
- `comment-draft-briefing.txt` — Call 2 (comment draft briefing)
- `hypericum-domains.txt` — problem domain taxonomy

Run `npm run sync-prompts` (or any build/test) to sync into TypeScript.
