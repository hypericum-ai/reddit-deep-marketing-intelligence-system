'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TERMINALS_DIR = path.join(
  process.env.HOME ?? '',
  '.cursor/projects/home-tegisty-Desktop-hypericum-projects-reddit-deep-marketing-intelligence-system/terminals'
);
const EXPORTS_DIR = path.join(__dirname, '..', 'exports');
const CONFIG_PATH = path.join(__dirname, '..', 'prompts', 'llm-config.json');

function loadExportMinDraftedAtMs() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const ms = Date.parse(config.exportMinDraftedAt ?? '');
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

function filterExportData(data, minDraftedAtMs) {
  if (!minDraftedAtMs) {
    data.signals = (data.signals ?? []).filter(
      (signal) => signal.commentDraft?.relevance !== 'none'
    );
    return data;
  }

  data.signals = (data.signals ?? []).filter((signal) => {
    const draft = signal.commentDraft;
    if (draft) {
      if (draft.relevance === 'none') {
        return false;
      }
      return draft.draftedAt >= minDraftedAtMs;
    }

    const insight = signal.insight;
    if (insight && insight.extractedAt < minDraftedAtMs) {
      return false;
    }

    return (signal.updatedAt ?? 0) >= minDraftedAtMs;
  });

  return data;
}

function findLatestExportJson() {
  let raw;
  try {
    raw = execSync(
      'grep -h "RSR_CHUNK\\|RSR_EXPORT_START\\|RSR_EXPORT_END" ' + TERMINALS_DIR + '/*.txt',
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );
  } catch {
    return null;
  }

  const lines = raw.split('\n');

  let lastEndIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('RSR_EXPORT_END:')) {
      lastEndIdx = i;
      break;
    }
  }
  if (lastEndIdx === -1) return null;

  const endLine = lines[lastEndIdx];
  const endMatch = endLine.match(/RSR_EXPORT_END:(\d+)/);
  if (!endMatch) return null;
  const totalChunks = parseInt(endMatch[1], 10);

  const chunks = new Array(totalChunks).fill(null);
  let startIdx = -1;

  for (let i = lastEndIdx - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.includes('RSR_EXPORT_START:')) {
      startIdx = i;
      break;
    }
    const chunkMatch = line.match(/RSR_CHUNK:(\d+):([\s\S]*)/);
    if (chunkMatch) {
      const idx = parseInt(chunkMatch[1], 10);
      if (idx < totalChunks && chunks[idx] === null) {
        chunks[idx] = chunkMatch[2];
      }
    }
  }

  if (startIdx === -1) return null;
  if (chunks.some((c) => c === null)) return null;

  try {
    return JSON.parse(chunks.join(''));
  } catch {
    return null;
  }
}

function saveExport(data) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const ts = new Date(data.exportedAt).toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(EXPORTS_DIR, `signals-${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  return outPath;
}

console.log('Scanning: ' + TERMINALS_DIR);

const rawData = findLatestExportJson();

if (!rawData) {
  console.error('\nNo RSR_EXPORT found.');
  console.error('  1. Make sure the playtest is running  (npm run dev)');
  console.error('  2. Click "RSR: Dump signals to log" on any post');
  console.error('  3. Then run this script again\n');
  process.exit(1);
}

const minDraftedAtMs = loadExportMinDraftedAtMs();
const data = filterExportData(rawData, minDraftedAtMs);
const outPath = saveExport(data);

console.log('\nExported at : ' + data.exportedAt);
console.log('Signals(raw): ' + (rawData.signals?.length ?? 0));
console.log('Signals(out): ' + data.signals.length);
console.log('Min drafted : ' + (minDraftedAtMs ? new Date(minDraftedAtMs).toISOString() : 'none'));
console.log('Saved to    : ' + outPath + '\n');
console.log('── Ranked opportunities ───────────────────────────');
for (const r of data.ranked ?? []) {
  console.log('  ' + r.category.padEnd(28) + ' score=' + r.opportunityScore + '  freq=' + r.frequency + '  avgIntent=' + r.avgIntent);
}
console.log('───────────────────────────────────────────────────\n');
