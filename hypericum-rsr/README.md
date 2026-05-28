# Hypericum RSR (Reddit Signal Radar)

Devvit-native app that captures post and comment events, scores marketing intent, runs Gemini LLM extraction, and exposes a reviewer dashboard inside Reddit.

## Features

- Event triggers: `onPostSubmit`, `onCommentSubmit`, `onPostUpdate`
- Tier-1 rule-based intent scoring with intent types (`frustration`, `switching`, `discovery`, `complaint`)
- Config-driven phrase lists (`src/config/intentRules.json`) and category taxonomy (`src/config/categories.json`)
- Per-subreddit settings (min score, min length, enabled categories, Gemini API key, monitor subs)
- Redis persistence with idempotent saves and edit upserts
- Similar post detection (heuristic + Gemini semantic embeddings) with reply redirector
- **LLM Call 1** — insight extraction + `problem_domain` mapping (score ≥ 30)
- **LLM Call 2** — 60–100 word comment drafts for on-domain high-intent posts (score ≥ 70)
- Reviewer dashboard custom post with redirect banner, relevance filters, copy-draft, and regenerate-draft actions
- Mod tools: dashboard sync, signal dump, stale LLM purge, subreddit monitor, engagement scan

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Playtest on dev subreddit (`hypericum_rsr_dev`) |
| `npm run build` | Production bundle |
| `npm run test` | Unit tests (61+ cases) |
| `npm run sync-prompts` | Sync `prompts/` → `src/generated/llmPrompts.ts` |
| `npm run preview-test-post` | Score eval post locally without Gemini |
| `npm run export` | Filter terminal dump → `exports/` |
| `npm run deploy` | Upload to Reddit |

## Prompts and config

Edit files under `prompts/`, then run `npm run sync-prompts`:

```
prompts/
  llm-config.json                 thresholds, word limits, export cutoff
  insight-extraction.prompt.txt   Call 1 template
  comment-draft-briefing.txt      Call 2 briefing
  hypericum-domains.txt           domain taxonomy
  test-post.json                  eval post for playtesting
```

Generated output: `src/generated/llmPrompts.ts` (committed; rebuilt on prebuild/pretest).

## Project structure

```
src/
  config/           intent rules + category keywords
  core/             pipeline, LLM, similarity, reviewer queue
  routes/           triggers, API, mod menu, dashboard page
  storage/          Redis signal store, drafts, insights
  client/           reviewer dashboard UI
  generated/        llmPrompts.ts (auto-generated)
scripts/            sync-prompts, save-export, preview-test-post
```

See [../docs/devvit_architecture.md](../docs/devvit_architecture.md) for the full system design.

## Setup from scratch

See the [root README](../README.md) for SSH clone, Node requirements, and `./scripts/setup.sh`.

Quick path:

```bash
cd hypericum-rsr
nvm use          # optional; requires Node >= 22.2.0 (.nvmrc)
npm ci
npm run login
npm run dev
```

## Local eval workflow

1. `npm run dev` and open `r/hypericum_rsr_dev`
2. Set **Gemini API Key** in mod settings; leave monitor subs empty for clean eval
3. Mod menu → **RSR: Reset dev subreddit** to remove your posts and wipe the queue (dev only)
4. `npm run preview-test-post` → post title/body to the subreddit
5. Open reviewer dashboard → **Refresh**
6. Mod menu → **Dump signals to log** → `npm run export`

## License

BSD-3-Clause — see [LICENSE](./LICENSE).
