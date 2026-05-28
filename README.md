# Reddit Signal Radar (RSR)

An AI-powered, Devvit-native intelligence layer that transforms Reddit discussions into structured marketing insights in real time.

The active application lives in [`hypericum-rsr/`](./hypericum-rsr/).

## Requirements

Install these on the machine where you develop (local laptop or SSH server):

| Requirement | Version | Notes |
|-------------|---------|--------|
| **Git** | any recent | SSH key added to GitHub for clone |
| **Node.js** | **≥ 22.2.0** | LTS recommended; use `nvm` (see below) |
| **npm** | comes with Node | used for all app commands |
| **Reddit account** | — | developer access for [Devvit](https://developers.reddit.com/) |
| **Gemini API key** | — | from [Google AI Studio](https://aistudio.google.com/); set in Reddit mod settings at runtime |

You do **not** need Python, PRAW, or a root `.env` file to run the Devvit app.

Optional (legacy, not used by the app): see [`legacy/ingestion/`](./legacy/ingestion/).

## Fresh clone (SSH)

```bash
# 1. Clone (SSH)
git clone git@github.com:hypericum-ai/reddit-deep-marketing-intelligence-system.git
cd reddit-deep-marketing-intelligence-system

# 2. Install Node 22+ (if needed — nvm example)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart shell, then:
cd hypericum-rsr
nvm install    # reads .nvmrc → Node 22
nvm use

# 3. Install all packages (see requirements.txt)
chmod +x scripts/install-requirements.sh scripts/setup.sh
bash scripts/install-requirements.sh

# Or full setup including tests:
# bash scripts/setup.sh
```

### Manual install (same as install-requirements.sh)

```bash
bash scripts/install-requirements.sh
# or: cd hypericum-rsr && npm ci && npm run sync-prompts
```

## Run the app

```bash
cd hypericum-rsr

# One-time: authenticate Devvit CLI with your Reddit developer account
npm run login

# Start playtest (watches/builds + connects to r/hypericum_rsr_dev)
npm run dev
```

On a **headless SSH server**, `npm run login` prints a URL — open it on your laptop, sign in, then return to the terminal.

### Reddit / subreddit configuration

In **Mod tools → Hypericum RSR → Settings** on the playtest subreddit:

| Setting | Eval recommendation |
|---------|---------------------|
| **Gemini API Key** | Required for LLM insight + drafts |
| **Monitor subreddits** | Leave empty for clean eval |
| **Minimum intent score** | Default `30` |

### Eval workflow

1. `npm run dev`
2. Mod menu → **RSR: Reset dev subreddit** (optional clean slate)
3. `npm run preview-test-post` → copy title/body to `r/hypericum_rsr_dev`
4. Mod menu → **RSR: Create Review Dashboard** (or open existing)
5. Dashboard → **Refresh**; use search / regenerate draft as needed
6. Mod menu → **RSR: Dump signals to log** → `npm run export` (second terminal)

## Architecture

The system runs inside Reddit via Devvit:

1. **Event capture** — `onPostSubmit`, `onCommentSubmit`, `onPostUpdate`
2. **Intent scoring** — rule-based filtering and clustering
3. **LLM pipeline** — Gemini insight extraction (score ≥ 30) and comment drafts (score ≥ 70, on-domain)
4. **Reviewer dashboard** — queue, search, filters, copy/regenerate draft

See [docs/devvit_architecture.md](./docs/devvit_architecture.md) and [docs/client_system_overview.md](./docs/client_system_overview.md).

## Commands (`hypericum-rsr/`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Playtest on `hypericum_rsr_dev` |
| `npm run build` | Production bundle |
| `npm run test` | Unit tests |
| `npm run sync-prompts` | Sync `prompts/` → `src/generated/llmPrompts.ts` |
| `npm run preview-test-post` | Local scoring preview (no Gemini) |
| `npm run export` | Save filtered dump from playtest terminal |
| `npm run deploy` | Upload to Reddit |
| `npm run login` | Devvit CLI authentication |

## Project structure

```
hypericum-rsr/          Devvit app (main product)
requirements.txt       Package manifest + install instructions
scripts/install-requirements.sh   npm ci + sync-prompts after clone
scripts/setup.sh        install + run tests
```

## Configuration

Edit `hypericum-rsr/prompts/` then run `npm run sync-prompts`:

- `llm-config.json` — word limits, score thresholds, export cutoff
- `insight-extraction.prompt.txt` — Call 1 template
- `comment-draft-briefing.txt` — Call 2 briefing
- `hypericum-domains.txt` — problem domain taxonomy

## Security

- Do not commit `.env` or API keys
- Gemini key is stored in Devvit subreddit settings, not in the repo
- `hypericum-rsr/exports/` is gitignored (local eval dumps only)

## License

BSD-3-Clause — see [hypericum-rsr/LICENSE](./hypericum-rsr/LICENSE).
