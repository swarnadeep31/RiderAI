// Tries the AI route builder on one video, outside the app, and prints what
// Gemini found and what it cost. Use it to check accuracy and cost on real
// vlogs before relying on the feature.
//
//   npm run try-ai -w server -- <youtube-link>
//   npm run try-ai -w server -- <youtube-link> --high            (better at reading boards, ~3-4x the cost)
//   npm run try-ai -w server -- <youtube-link> --fps 0.5         (look at 1 frame every 2 s: fewer picture tokens)
//   npm run try-ai -w server -- <youtube-link> --start 0 --end 1800   (only the first 30 minutes)
//   npm run try-ai -w server -- <youtube-link> --model gemini-3.1-flash-lite
//   npm run try-ai -w server -- <youtube-link> --geocode         (also find the places on the map)
//   npm run try-ai -w server -- ride.mp4 --no-audio             (a video file on this computer, sent without sound)
//   npm run try-ai -w server -- ride.mp4 --sound-only           (only its sound: what's said; the cheapest)
//   npm run try-ai -w server -- --list-models
//
// A video file is shrunk with FFmpeg first (smaller picture, 1 frame a second,
// and no sound with --no-audio; or just the sound with --sound-only), uploaded to Gemini, and deleted from Gemini
// afterwards. YouTube links are read by Gemini straight from YouTube, sound
// included: to try without sound, use a file of the video (e.g. your own).
import { existsSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import { cleanClip, mergeClips } from '../src/aiRoute/clean.js';
import { summarizeUsage } from '../src/aiRoute/cost.js';
import { geocodeCandidates } from '../src/aiRoute/geocode.js';
import { aiConfig } from '../src/config.js';
import { deleteUploadedVideo, extractPlaces, PROMPT_VERSION, uploadVideo } from '../src/services/gemini.js';
import { extractSound, prepareVideo, probeVideo } from '../src/services/videoFile.js';
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
    fps: { type: 'string' },
    'no-audio': { type: 'boolean', default: false },
    'sound-only': { type: 'boolean', default: false },
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

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const USAGE =
  'Usage: npm run try-ai -w server -- <youtube-link | video-file> [--no-audio | --sound-only] [--fps 0.5] [--high] [--start 0 --end 1800] [--model name] [--geocode]';

// npm runs this script inside server/, so read file paths from where npm was started.
const input = positionals[0];
const filePath = input ? resolve(process.env.INIT_CWD ?? process.cwd(), input) : null;
const isFile = Boolean(filePath && existsSync(filePath));
const youtubeId = isFile ? null : parseYouTubeId(input);
if (!isFile && !youtubeId) fail(input ? `"${input}" is neither a YouTube link nor a video file.\n${USAGE}` : USAGE);

const fps = values.fps === undefined ? undefined : Number(values.fps);
if (fps !== undefined && !(fps > 0 && fps <= 24)) fail('--fps must be more than 0 and at most 24 (e.g. 0.5 = one frame every 2 seconds).');
const noAudio = values['no-audio'];
const soundOnly = values['sound-only'];
if (noAudio && soundOnly) fail('Use --no-audio or --sound-only, not both.');
if (soundOnly && !isFile) {
  fail("--sound-only needs a video file: Gemini fetches YouTube links itself, picture included.\nUse a file of the video, e.g. npm run try-ai -w server -- ride.mp4 --sound-only");
}
if (noAudio && !isFile) {
  fail(
    "--no-audio needs a video file. Gemini fetches YouTube links itself, sound included, and can't be told to skip it.\n" +
      'Use a file of the video (e.g. your own: npm run try-ai -w server -- ride.mp4 --no-audio),\n' +
      'or keep the link and send fewer frames instead: --fps 0.5',
  );
}

let video;
let upload;
let preparedPath;
if (isFile) {
  const mb = (bytes) => (bytes < 1e6 ? `${Math.ceil(bytes / 1e3)} KB` : `${(bytes / 1e6).toFixed(1)} MB`);
  let original;
  try {
    original = await probeVideo(filePath);
  } catch (err) {
    fail(`Can't read ${input}: ${err.message}`);
  }
  console.log(
    `File: ${basename(filePath)} (${formatClock(original.durationSec)}, ${original.width}×${original.height}, ` +
      `${original.hasAudio ? 'with sound' : 'no sound'}, ${mb(original.sizeBytes)})`,
  );
  if (soundOnly && !original.hasAudio) fail('This file has no sound, so --sound-only has nothing to send.');
  process.stdout.write(soundOnly ? 'Taking out the sound with FFmpeg...' : `Making a smaller copy${noAudio ? ' without sound' : ''} with FFmpeg...`);
  preparedPath = join(tmpdir(), `trailcast-${Date.now()}.${soundOnly ? 'm4a' : 'mp4'}`);
  try {
    if (soundOnly) {
      await extractSound(filePath, preparedPath);
      process.stdout.write(` ${mb((await stat(preparedPath)).size)}, sound only\n`);
    } else {
      const prepared = await prepareVideo(filePath, preparedPath, { noAudio, maxHeight: values.high ? 720 : 480, fps: Math.max(1, fps ?? 1) });
      process.stdout.write(` ${mb(prepared.sizeBytes)}, ${prepared.width}×${prepared.height}, ${prepared.hasAudio ? 'with sound' : 'no sound'}\n`);
    }
  } catch (err) {
    await rm(preparedPath, { force: true });
    fail(`\n${err.message}`);
  }
  process.stdout.write('Uploading to Gemini and waiting for it to process the file...');
  try {
    upload = await uploadVideo(preparedPath, { mimeType: soundOnly ? 'audio/mp4' : 'video/mp4' });
  } catch (err) {
    await rm(preparedPath, { force: true });
    fail(`\nUpload failed: ${err.message}`);
  }
  process.stdout.write(' done\n');
  video = { title: basename(filePath), author: 'a file on this computer', durationSec: original.durationSec, noAudio, soundOnly };
} else {
  video = await checkVideo(youtubeId);
  if (!video.ok) fail(`Can't use this video: ${video.reason}`);
  console.log(`Video: ${video.title} (by ${video.author})`);
}
const sourceName = youtubeId ?? basename(filePath).replace(/\.[^.]+$/, '');

const clipStart = values.start ? parseClock(values.start) : 0;
const clipEnd = values.end ? parseClock(values.end) : null;
const model = values.model ?? config.model;
console.log(
  `Model: ${model} · detail: ${values.high ? 'high' : 'normal'} · thinking: ${config.thinkingLevel || 'model default'} · ` +
    (soundOnly ? 'sound only (no picture) · ' : `frames: ${fps ?? 1}/s · sound: ${noAudio ? 'removed' : 'yes'} · `) +
    `part: ${clipEnd === null && clipStart === 0 ? 'whole video' : `${formatClock(clipStart)}–${clipEnd === null ? 'end' : formatClock(clipEnd)}`}`,
);
console.log('Asking Gemini... (a 30-minute video usually takes a minute or two)\n');

// What to do about an error that didn't go away.
function explainFailure(err) {
  if (err.status === 503 || err.status === 500) {
    return [
      "Google's servers are overloaded right now. Your key, your code and your limits are fine.",
      'Try again in a few minutes, or try another model, e.g. --model gemini-2.5-flash-lite (see --list-models).',
    ];
  }
  if (err.status === 429) {
    return [
      'A rate limit was hit. Per-minute limits reset after a minute; daily ones at midnight Pacific time (12:30 PM in India).',
      'A long video can pass the tokens-per-minute limit on its own: send fewer frames (--fps 0.5) or part of it (--end 30:00).',
    ];
  }
  return [];
}

const startedAt = Date.now();
const waits = config.retryDelays.slice(0, 2); // seconds to wait before trying again when Gemini is busy
let result;
try {
  for (let attempt = 0; !result; attempt++) {
    try {
      result = await extractPlaces({ youtubeId, file: upload, clipStart, clipEnd, model, highDetail: values.high, fps, noAudio, soundOnly });
    } catch (err) {
      if (!err.retryable || attempt >= waits.length) {
        console.error(`Gemini failed: ${err.message}`);
        for (const line of explainFailure(err)) console.error(`  ${line}`);
        process.exitCode = 1;
        break;
      }
      console.log(`Gemini is busy${err.status ? ` (${err.status})` : ''}. Trying again in ${waits[attempt]} s...`);
      await new Promise((done) => setTimeout(done, waits[attempt] * 1000));
    }
  }
} finally {
  // Don't leave the video with Gemini or in the temp folder.
  if (upload) await deleteUploadedVideo(upload.name);
  if (preparedPath) await rm(preparedPath, { force: true });
}
if (!result) process.exit(1);
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
const settingsTag = [values.high ? 'high' : 'normal', noAudio && 'nosound', soundOnly && 'soundonly', fps && fps !== 1 && `fps${fps}`].filter(Boolean).join('-');
const file = `ai-results/${sourceName}-${model}-${settingsTag}-${Date.now()}.json`;
await writeFile(
  file,
  JSON.stringify(
    { source: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : basename(filePath), video, model, promptVersion: PROMPT_VERSION, highDetail: values.high, fps: fps ?? 1, noAudio, soundOnly, clipStart, clipEnd, seconds: Number(seconds), usage: result.usage, raw: result.raw, candidates, hiddenRanges },
    null,
    2,
  ),
);
console.log(`\nSaved everything to server/${file}`);
