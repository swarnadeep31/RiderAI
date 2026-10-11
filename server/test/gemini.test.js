import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { summarizeUsage } from '../src/aiRoute/cost.js';
import { extractPlaces, GeminiError } from '../src/services/gemini.js';
import { startFakeService } from './helpers.js';

let gemini;
let reply;
before(async () => {
  // A stand-in for Google's Gemini API: answers whatever `reply` says.
  gemini = await startFakeService(() => reply);
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

test('explains errors, and says which are worth retrying', async () => {
  reply = [429, { error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } }];
  await assert.rejects(extractPlaces({ youtubeId: 'aBcD3fGh1_-' }), (err) => err instanceof GeminiError && err.retryable && /busy/.test(err.message));

  reply = [400, { error: { code: 400, message: 'Video is not public', status: 'INVALID_ARGUMENT' } }];
  await assert.rejects(extractPlaces({ youtubeId: 'aBcD3fGh1_-' }), (err) => !err.retryable && /public/.test(err.message));

  reply = [
    200,
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Sorry, I cannot help.' }] } }], usageMetadata: {} },
  ];
  await assert.rejects(extractPlaces({ youtubeId: 'aBcD3fGh1_-' }), /not with the JSON/);
});

test('works out the cost, counting thinking as output', () => {
  const usage = summarizeUsage('gemini-3.5-flash-lite-preview-10-2026', { promptTokenCount: 180000, candidatesTokenCount: 2500, thoughtsTokenCount: 500 });
  assert.equal(usage.inputTokens, 180000);
  assert.equal(usage.outputTokens, 3000);
  // 180,000 x $0.30/M + 3,000 x $2.50/M
  assert.ok(Math.abs(usage.costUsd - 0.0615) < 1e-9);
});
