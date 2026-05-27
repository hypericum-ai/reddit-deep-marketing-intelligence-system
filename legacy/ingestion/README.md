# Legacy PRAW ingestion CLI

This folder holds the **pre-Devvit** batch ingestion prototype. The active product lives in [`hypericum-rsr/`](../hypericum-rsr/) as a Devvit-native app with real-time triggers.

The CLI entry point (`run_ingestion.py`) expects a Python package at `src/ingestion/` that is not included in this repository. Keep these files for reference only unless you revive the external pipeline.

## Files

- `run_ingestion.py` — CLI wrapper
- `config/sample_job.json` — example batch job config
- `requirements.txt` — Python dependencies (Reddit API via PRAW)
- `pyproject.toml` — pytest settings for the old layout

## Setup (if reviving)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r legacy/ingestion/requirements.txt
cp .env.example .env   # Reddit API credentials
python legacy/ingestion/run_ingestion.py --config legacy/ingestion/config/sample_job.json
```
