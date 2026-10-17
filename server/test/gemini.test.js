import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { summarizeUsage } from '../src/aiRoute/cost.js';
import { defaultServices } from '../src/aiRoute/pipeline.js';
import {
  buildPrompt,
  deleteUploadedVideo,
  extractPlaces,
  extractPlacesWithFallback,
  forgetRestingModels,
  GeminiError,
  uploadVideo,
} from '../src/services/gemini.js';
import { hasFfmpeg } from '../src/services/videoFile.js';
import { startFakeService } from './helpers.js';

let gemini;
let reply;
before(async () => {
  // A stand-in for Google's Gemini API: answers whatever `reply` says
  // (a function gets the request, for tests with several steps).
  gemini = await startFakeService((req) => (typeof reply === 'function' ? reply(req) : reply));
  process.env.GEMINI_BASE_URL = gemini.url;
  process.env.GEMINI_API_KEY = 'test-key';
});
after(() => gemini.close());
beforeEach(() => {
  gemini.requests.length = 0;
  delete process.env.AI_HIGH_DETAIL;
});

const answer = { places: [{ time: '1:30', name: 'Howrah', presence: 'here', evidence: 'sign', confidence: 0.9 }], hidden_ranges: [] };
const ok = (data = answer) => [
  200,
  {
    candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(data) }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 180000, candidatesTokenCount: 2500, thoughtsTokenCount: 500 },
  },
];

test('sends the YouTube link, the prompt and the settings, and reads the answer', async () => {
  reply = ok();
  const result = await extractPlaces({ youtubeId: 'aBcD3fGh1_-', model: 'gemini-3.5-flash-lite' });
  assert.deepEqual(result.data, answer);
  assert.equal(result.usage.promptTokenCount, 180000);

  const { url, headers, body } = gemini.requests[0];
  assert.equal(url, '/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(headers['x-goog-api-key'], 'test-key');
  const [videoPart, textPart] = body.contents[0].parts;
  assert.deepEqual(videoPart, { fileData: { fileUri: 'https://www.youtube.com/watch?v=aBcD3fGh1_-' } });
  assert.match(textPart.text, /You are watching all of a travel video/);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.mediaResolution, 'MEDIA_RESOLUTION_LOW');
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'MINIMAL' });
  assert.ok(body.generationConfig.responseJsonSchema.properties.places);
});

test('a clip of a long video is sent with start and end offsets', async () => {
  reply = ok();
  await extractPlaces({ youtubeId: 'aBcD3fGh1_-', clipStart: 3540, clipEnd: 7140, highDetail: true });
  const { body } = gemini.requests[0];
  assert.deepEqual(body.contents[0].parts[0].videoMetadata, { startOffset: '3540s', endOffset: '7140s' });
  assert.match(body.contents[0].parts[1].text, /from 59:00 to 1:59:00 .*counted from the start of the whole video/s);
  assert.equal(body.generationConfig.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
});

test('fewer frames a second can be asked for, to use fewer tokens', async () => {
  reply = ok();
  await extractPlaces({ youtubeId: 'aBcD3fGh1_-', fps: 0.5 });
  const [videoPart, textPart] = gemini.requests[0].body.contents[0].parts;
  assert.deepEqual(videoPart.videoMetadata, { fps: 0.5 });
  assert.doesNotMatch(textPart.text, /NO SOUND/);
});

test('the prompt only mentions sound when the video has none', () => {
  const normal = buildPrompt({ wholeVideo: true });
  assert.doesNotMatch(normal, /\{\{|NO SOUND/);
  assert.match(buildPrompt({ wholeVideo: true, noAudio: true }), /landmarks\. This copy of the video has NO SOUND: use only what you see/);
  assert.match(buildPrompt({ wholeVideo: true, soundOnly: true }), /landmarks\. You only have the SOUND of this video, no picture: use what is said/);
});

test('a video file is uploaded, processed, sent by its Gemini link, and can be deleted', async () => {
  const path = join(tmpdir(), `trailcast-test-${Date.now()}.mp4`);
  await writeFile(path, Buffer.alloc(3000, 7));
  const file = { name: 'files/ride123', uri: `${gemini.url}/v1beta/files/ride123`, mimeType: 'video/mp4' };
  let checks = 0;
  reply = (req) => {
    if (req.url === '/upload/v1beta/files') return [200, {}, { 'x-goog-upload-url': `${gemini.url}/upload-session/1` }];
    if (req.url.startsWith('/upload-session/1')) return [200, { file: { ...file, state: 'PROCESSING' } }, { 'x-goog-upload-status': 'final' }];
    if (req.method === 'GET' && req.url.startsWith('/v1beta/files/ride123')) {
      checks += 1;
      return [200, { ...file, state: checks < 2 ? 'PROCESSING' : 'ACTIVE' }];
    }
    if (req.method === 'DELETE') return [200, {}];
    return ok();
  };
  try {
    const uploaded = await uploadVideo(path, { pollMs: 10 });
    assert.deepEqual(uploaded, file);
    assert.equal(checks, 2); // waited until Gemini had processed it

    const upload = gemini.requests.find((r) => r.url.startsWith('/upload-session/1'));
    assert.equal(upload.body.bytes, 3000);
    assert.equal(upload.headers['x-goog-upload-command'], 'upload, finalize');

    await extractPlaces({ file: uploaded, noAudio: true, fps: 0.5 });
    const ask = gemini.requests.find((r) => r.url.includes(':generateContent'));
    const [videoPart, textPart] = ask.body.contents[0].parts;
    assert.deepEqual(videoPart, { fileData: { fileUri: file.uri, mimeType: 'video/mp4' }, videoMetadata: { fps: 0.5 } });
    assert.match(textPart.text, /NO SOUND/);

    await deleteUploadedVideo(uploaded.name);
    assert.ok(gemini.requests.some((r) => r.method === 'DELETE' && r.url.startsWith('/v1beta/files/ride123')));
  } finally {
    await rm(path, { force: true });
  }
});

test('an uploaded ride, sound only: FFmpeg takes out the sound, Gemini gets it as audio, and it is deleted after', { skip: !(await hasFfmpeg()) && 'FFmpeg is not installed' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trailcast-sound-'));
  const ride = join(dir, 'ride.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=4', '-f', 'lavfi', '-i', 'sine=duration=4', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', ride]);
  const file = { name: 'files/sound1', uri: `${gemini.url}/v1beta/files/sound1`, mimeType: 'audio/mp4' };
  reply = (req) => {
    if (req.url === '/upload/v1beta/files') return [200, {}, { 'x-goog-upload-url': `${gemini.url}/upload-session/2` }];
    if (req.url.startsWith('/upload-session/2')) return [200, { file: { ...file, state: 'ACTIVE' } }, { 'x-goog-upload-status': 'final' }];
    if (req.method === 'DELETE') return [200, {}];
    return ok();
  };
  try {
    const job = { mediaMode: 'sound', uploadPath: ride, durationSec: 4, model: 'gemini-3.5-flash-lite', highDetail: false };
    const result = await defaultServices.extractFromUpload({ job, clip: { start: 0, end: 4 } });
    assert.ok(Array.isArray(result.data.places));

    const sent = gemini.requests.find((r) => r.url.startsWith('/upload-session/2'));
    assert.ok(sent.body.bytes > 1000 && sent.body.bytes < (await stat(ride)).size, `sent ${sent.body.bytes} bytes: just the sound`);
    const ask = gemini.requests.find((r) => r.url.includes(':generateContent'));
    const [soundPart, textPart] = ask.body.contents[0].parts;
    assert.deepEqual(soundPart, { fileData: { fileUri: file.uri, mimeType: 'audio/mp4' } });
    assert.match(textPart.text, /only have the SOUND/);
    assert.ok(gemini.requests.some((r) => r.method === 'DELETE' && r.url.startsWith('/v1beta/files/sound1')), 'deleted from Gemini');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('explains errors, and says which are worth retrying', async () => {
  reply = [429, { error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } }];
  await assert.rejects(extractPlaces({ youtubeId: 'aBcD3fGh1_-' }), (err) => err instanceof GeminiError && err.retryable && /busy/.test(err.message));

  reply = [400, { error: { code: 400, message: 'Video is not public', status: 'INVALID_ARGUMENT' } }];
  await assert.rejects(extractPlaces({ youtubeId: 'aBcD3fGh1_-' }), (err) => !err.retryable && /public/.test(err.message));

  // A wrong key also comes back as 400: it must say it's the key, not the video.
  reply = [400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }];
  await assert.rejects(extractPlaces({ youtubeId: 'aBcD3fGh1_-' }), (err) => !err.retryable && /refused the API key/.test(err.message) && !/public/.test(err.message));

  reply = [
    200,
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Sorry, I cannot help.' }] } }], usageMetadata: {} },
  ];
  await assert.rejects(extractPlaces({ youtubeId: 'aBcD3fGh1_-' }), /not with the JSON/);
});

describe('switching to a backup model', () => {
  // Gemini's answer when a free-tier limit is reached: which limit, and when to try again.
  const limitReached = (quotaId, retryDelay = '20s') => [
    429,
    {
      error: {
        code: 429,
        message: 'You exceeded your current quota.',
        status: 'RESOURCE_EXHAUSTED',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
        ],
      },
    },
  ];
  const busy = [503, { error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' } }];
  const asked = () => gemini.requests.filter((r) => r.url.includes(':generateContent')).map((r) => r.url.match(/models\/([^:]+):/)[1]);

  beforeEach(() => {
    forgetRestingModels();
    process.env.GEMINI_FALLBACK_MODELS = 'gemini-backup-1, gemini-backup-2';
  });
  after(() => delete process.env.GEMINI_FALLBACK_MODELS);

  test('a model at its limit is rested, and the next one answers at once', async () => {
    reply = (req) => (req.url.includes('gemini-main') ? limitReached('GenerateContentInputTokensPerModelPerMinute-FreeTier') : ok());
    const result = await extractPlacesWithFallback({ youtubeId: 'aBcD3fGh1_-', model: 'gemini-main' });
    assert.equal(result.model, 'gemini-backup-1');
    assert.deepEqual(asked(), ['gemini-main', 'gemini-backup-1']);

    // While it rests (Gemini said 20 seconds), the main model isn't asked again.
    gemini.requests.length = 0;
    await extractPlacesWithFallback({ youtubeId: 'aBcD3fGh1_-', model: 'gemini-main' });
    assert.deepEqual(asked(), ['gemini-backup-1']);
  });

  test('too busy (503) and gone (404) also switch; the rest of the list is tried in order', async () => {
    reply = (req) => {
      if (req.url.includes('gemini-main')) return busy;
      if (req.url.includes('gemini-backup-1')) return [404, { error: { code: 404, message: 'This model models/gemini-backup-1 is no longer available to new users.', status: 'NOT_FOUND' } }];
      return ok();
    };
    const result = await extractPlacesWithFallback({ youtubeId: 'aBcD3fGh1_-', model: 'gemini-main' });
    assert.equal(result.model, 'gemini-backup-2');
    assert.deepEqual(asked(), ['gemini-main', 'gemini-backup-1', 'gemini-backup-2']);
  });

  test("problems that aren't about the model don't switch", async () => {
    reply = [400, { error: { code: 400, message: 'Video is not public', status: 'INVALID_ARGUMENT' } }];
    await assert.rejects(extractPlacesWithFallback({ youtubeId: 'aBcD3fGh1_-', model: 'gemini-main' }), /public/);
    assert.deepEqual(asked(), ['gemini-main']);
  });

  test('when every model is resting, it says so and can be retried later', async () => {
    reply = limitReached('GenerateRequestsPerDayPerProjectPerModel-FreeTier');
    await assert.rejects(extractPlacesWithFallback({ youtubeId: 'aBcD3fGh1_-', model: 'gemini-main' }), (err) => err.retryable && err.status === 429);
    assert.equal(asked().length, 3);
    gemini.requests.length = 0;
    await assert.rejects(
      extractPlacesWithFallback({ youtubeId: 'aBcD3fGh1_-', model: 'gemini-main' }),
      (err) => err.retryable && /Every AI model has reached its limit or is busy until about/.test(err.message),
    );
    assert.equal(asked().length, 0, 'a daily limit rests the models for an hour');
  });

  test('without backups, only the main model is asked', async () => {
    delete process.env.GEMINI_FALLBACK_MODELS;
    reply = busy;
    await assert.rejects(extractPlacesWithFallback({ youtubeId: 'aBcD3fGh1_-', model: 'gemini-main' }), (err) => err.retryable);
    assert.deepEqual(asked(), ['gemini-main']);
  });
});

test('works out the cost, counting thinking as output', () => {
  const usage = summarizeUsage('gemini-3.5-flash-lite-preview-10-2026', { promptTokenCount: 180000, candidatesTokenCount: 2500, thoughtsTokenCount: 500 });
  assert.equal(usage.inputTokens, 180000);
  assert.equal(usage.outputTokens, 3000);
  // 180,000 x $0.30/M + 3,000 x $2.50/M
  assert.ok(Math.abs(usage.costUsd - 0.0615) < 1e-9);
});
