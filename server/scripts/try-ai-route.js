// Tries the AI route builder on one YouTube video, outside the app, and prints
// what Gemini found and what it cost. Use it to check accuracy and cost on
// real vlogs before relying on the feature.
//
//   npm run try-ai -w server -- <youtube-link>
//   npm run try-ai -w server -- <youtube-link> --high            (better at reading boards, ~3-4x the cost)
//   npm run try-ai -w server -- <youtube-link> --start 0 --end 1800   (only the first 30 minutes)
//   npm run try-ai -w server -- <youtube-link> --model gemini-3.1-flash-lite
//   npm run try-ai -w server -- <youtube-link> --geocode         (also find the places on the map)
//   npm run try-ai -w server -- --list-models
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import { cleanClip, mergeClips } from '../src/aiRoute/clean.js';
import { summarizeUsage } from '../src/aiRoute/cost.js';
import { geocodeCandidates } from '../src/aiRoute/geocode.js';
import { aiConfig } from '../src/config.js';
import { extractPlaces, PROMPT_VERSION } from '../src/services/gemini.js';
import { checkVideo } from '../src/services/youtubeInfo.js';
import { formatClock, parseClock } from '../src/utils/time.js';
import { parseYouTubeId } from '../src/utils/youtube.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: 'string' },
    high: { type: 'boolean', default: false },
    start: { type: 'string' },
    end: { type: 'string' },
    geocode: { type: 'boolean', default: false },
    'list-models': { type: 'boolean', default: false },
  },
});

const config = aiConfig();
if (!config.apiKey) {
  console.error('Set GEMINI_API_KEY in server/.env first (free key from https://aistudio.google.com).');
  process.exit(1);
}

if (values['list-models']) {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  console.log('Models your key can use for generateContent:');
  for await (const model of await ai.models.list()) {
    if (model.supportedActions?.includes('generateContent')) console.log(`  ${model.name.replace('models/', '')}`);
  }
  process.exit(0);
}

const youtubeId = parseYouTubeId(positionals[0]);
if (!youtubeId) {
  console.error('Usage: npm run try-ai -w server -- <youtube-link> [--high] [--start 0 --end 1800] [--model name] [--geocode]');
  process.exit(1);
}

const video = await checkVideo(youtubeId);
if (!video.ok) {
  console.error(`Can't use this video: ${video.reason}`);
  process.exit(1);
}
console.log(`Video: ${video.title} (by ${video.author})`);

const clipStart = values.start ? parseClock(values.start) : 0;
const clipEnd = values.end ? parseClock(values.end) : null;
const model = values.model ?? config.model;
console.log(
  `Model: ${model} · detail: ${values.high ? 'high' : 'normal'} · thinking: ${config.thinkingLevel || 'model default'} · ` +
    `part: ${clipEnd === null && clipStart === 0 ? 'whole video' : `${formatClock(clipStart)}–${clipEnd === null ? 'end' : formatClock(clipEnd)}`}`,
);
console.log('Asking Gemini... (a 30-minute video usually takes a minute or two)\n');

const startedAt = Date.now();
let result;
try {
  result = await extractPlaces({ youtubeId, clipStart, clipEnd, model, highDetail: values.high });
} catch (err) {
  console.error(`Gemini failed: ${err.message}`);
  process.exit(1);
}
const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);

// What Gemini said, as given, then cleaned the way the app cleans it.
const clip = { start: clipStart, end: clipEnd ?? Number.MAX_SAFE_INTEGER };
const cleaned = cleanClip(result.data, clip, Number.MAX_SAFE_INTEGER);
const { candidates, hiddenRanges } = mergeClips([cleaned], { minConfidence: config.minConfidence });
if (values.geocode) {
  process.stdout.write('Finding the places on the map (1 per second)...');
  await geocodeCandidates(candidates);
  process.stdout.write(' done\n\n');
}

console.log(`PLACES (${candidates.length}; ✓ = would be ticked in review)`);
for (const c of candidates) {
  const stay = c.stayUntil ? `–${formatClock(c.stayUntil)}` : '';
  const where = values.geocode ? (c.lat === null ? '  [not found on map]' : `  → ${c.label}`) : '';
  console.log(
    `${c.checked ? '✓' : ' '} ${formatClock(c.time).padStart(8)}${stay.padEnd(9)} ${c.presence.padEnd(9)} ${c.confidence.toFixed(2)} ` +
      `${c.evidence.padEnd(9)} ${c.name}${c.region ? `, ${c.region}` : ''}${c.quote ? `  "${c.quote}"` : ''}${where}`,
  );
  if (c.flags.length) console.log(`             flags: ${c.flags.join(', ')}`);
}
console.log(`\nHIDDEN RANGES (${hiddenRanges.length})`);
for (const r of hiddenRanges) console.log(`  ${formatClock(r.start)}–${formatClock(r.end)}  ${r.reason}`);

const usage = summarizeUsage(model, result.usage);
const inr = usage.costUsd * config.inrPerUsd;
console.log('\nCOST');
console.log(`  Took ${seconds} s`);
console.log(`  Input tokens:  ${usage.inputTokens.toLocaleString()}`);
for (const d of result.usage.promptTokensDetails ?? []) console.log(`    ${d.modality}: ${d.tokenCount?.toLocaleString()}`);
console.log(`  Output tokens: ${usage.outputTokens.toLocaleString()} (of which thinking: ${usage.thinkingTokens.toLocaleString()})`);
console.log(`  Cost: $${usage.costUsd.toFixed(4)} ≈ ₹${inr.toFixed(2)} (+18% GST ≈ ₹${(inr * 1.18).toFixed(2)}) at paid rates; ₹0 on the free tier`);

await mkdir('ai-results', { recursive: true });
const file = `ai-results/${youtubeId}-${model}-${values.high ? 'high' : 'normal'}-${Date.now()}.json`;
await writeFile(file, JSON.stringify({ youtubeId, video, model, promptVersion: PROMPT_VERSION, highDetail: values.high, clipStart, clipEnd, seconds: Number(seconds), usage: result.usage, raw: result.raw, candidates, hiddenRanges }, null, 2));
console.log(`\nSaved everything to server/${file}`);
