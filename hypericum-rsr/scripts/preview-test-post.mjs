#!/usr/bin/env node
/**
 * Preview how prompts/test-post.json scores through the rule-based pipeline
 * (no Gemini / Redis / Devvit required).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

function preprocess(text) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreIntent(cleanText, rules) {
  let score = 0;
  const matchedSignals = [];
  let topType = 'general';
  let topTypePoints = 0;

  for (const rule of rules) {
    if (!cleanText.includes(rule.phrase)) continue;
    score += rule.points;
    matchedSignals.push(rule.phrase);
    if (rule.points > topTypePoints) {
      topTypePoints = rule.points;
      topType = rule.intentType;
    }
  }

  const capped = Math.min(score, 100);
  const level = capped >= 70 ? 'high' : capped >= 40 ? 'medium' : 'low';
  return { score: capped, level, intentType: topType, matchedSignals };
}

function assignClusters(cleanText, categories) {
  const clusters = new Set();
  for (const category of categories) {
    if (category.keywords.some((kw) => cleanText.includes(kw))) {
      clusters.add(category.slug);
    }
  }
  return [...clusters];
}

function main() {
  const post = readJson('prompts/test-post.json');
  const config = readJson('prompts/llm-config.json');
  const rules = readJson('src/config/intentRules.json').rules;
  const categories = readJson('src/config/categories.json').categories;

  const combined = `${post.title}\n\n${post.body}`;
  const cleanText = preprocess(combined);
  const intent = scoreIntent(cleanText, rules);
  const clusters = assignClusters(cleanText, categories);
  const hypericumClusters = clusters.filter((c) =>
    config.hypericumDomainClusters.includes(c)
  );

  const willExtractInsight = intent.score >= config.thresholds.insightIntentScore;
  const hasHypericumDomain = false; // preview script — run insight call to know; assume regulatory-audit for this post
  const previewDomain = 'regulatory-audit';
  const willDraft =
    intent.score >= config.thresholds.draftIntentScore &&
    previewDomain !== 'n/a' &&
    (hypericumClusters.length > 0 || previewDomain !== 'n/a');

  console.log('=== RSR test post preview ===\n');
  console.log(`Subreddit: r/${post.subreddit}`);
  console.log(`Title: ${post.title}\n`);
  console.log('--- Body (copy to Reddit) ---');
  console.log(post.body);
  console.log('\n--- Pipeline preview ---');
  console.log(`Intent score: ${intent.score} (${intent.level})`);
  console.log(`Intent type: ${intent.intentType}`);
  console.log(`Matched phrases (${intent.matchedSignals.length}):`);
  for (const phrase of intent.matchedSignals) {
    console.log(`  • ${phrase}`);
  }
  console.log(`Clusters: ${clusters.join(', ') || 'none'}`);
  console.log(`Hypericum domain clusters: ${hypericumClusters.join(', ') || 'none'}`);
  console.log(`LLM insight (>= ${config.thresholds.insightIntentScore}): ${willExtractInsight ? 'YES' : 'NO'}`);
  console.log(`Comment draft (>= ${config.thresholds.draftIntentScore} + domain != n/a): ${willDraft ? 'LIKELY (verify domain via insight call)' : 'NO'}`);
  console.log('\n--- Next steps ---');
  console.log('1. cd hypericum-rsr && npm run dev');
  console.log(`2. Post the title + body above to r/${post.subreddit}`);
  console.log('3. Ensure Gemini API key is set in subreddit app settings');
  console.log('4. Mod menu → "RSR: Dump signals to log" or open reviewer dashboard');
}

main();
