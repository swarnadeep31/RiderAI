// Asks Gemini to watch (part of) a video and list the places the traveller
// passes through. For a public YouTube video, Gemini reads it from YouTube
// itself and TrailCast never downloads it. A video file on this computer is
// uploaded first (uploadVideo), which is how a copy without sound can be sent.
import { readFileSync } from 'node:fs';
import { GoogleGenAI, MediaResolution } from '@google/genai';
import { aiConfig } from '../config.js';
import { formatClock } from '../utils/time.js';

// A new version means analyses made with an older prompt aren't reused.
// v2 adds stay_kind (a break, or a night's stay).
export const PROMPT_VERSION = 'videoPlaces.v2';
const PROMPT = readFileSync(new URL(`../prompts/${PROMPT_VERSION}.md`, import.meta.url), 'utf8');

// The answer Gemini must give (JSON Schema). The server checks it again before use.
export const PLACES_SCHEMA = {
  type: 'object',
  required: ['places', 'hidden_ranges'],
  properties: {
    places: {
      type: 'array',
      items: {
        type: 'object',
        required: ['time', 'name', 'presence', 'evidence', 'confidence'],
        properties: {
          time: { type: 'string', description: 'H:MM:SS or MM:SS' },
          stay_until: { type: 'string', description: 'H:MM:SS or MM:SS' },
          stay_kind: { type: 'string', enum: ['break', 'overnight'] },
          name: { type: 'string' },
          region: { type: 'string' },
          alt_names: { type: 'array', items: { type: 'string' } },
          presence: { type: 'string', enum: ['here', 'mentioned'] },
          evidence: { type: 'string', enum: ['sign', 'milestone', 'speech', 'landmark'] },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    hidden_ranges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['start', 'end', 'reason'],
        properties: {
          start: { type: 'string', description: 'H:MM:SS or MM:SS' },
          end: { type: 'string', description: 'H:MM:SS or MM:SS' },
          reason: { type: 'string', enum: ['intro', 'recap', 'montage', 'flashback', 'off_route'] },
        },
      },
    },
  },
};

export function buildPrompt({ clipStart, clipEnd, wholeVideo, noAudio = false, soundOnly = false }) {
  const part = wholeVideo ? 'all' : `the part from ${formatClock(clipStart)} to ${formatClock(clipEnd)}`;
  const timeNote = wholeVideo ? '' : ', counted from the start of the whole video';
  let soundNote = '';
  if (noAudio) soundNote = ' This copy of the video has NO SOUND: use only what you see, including subtitles and other text on screen.';
  if (soundOnly) {
    soundNote =
      ' You only have the SOUND of this video, no picture: use what is said. Evidence is "speech" unless a sign or milestone is read out.';
  }
  return PROMPT.replace('{{part}}', part).replace('{{timeNote}}', timeNote).replace('{{soundNote}}', soundNote);
}

function client() {
  const { apiKey } = aiConfig();
  // GEMINI_BASE_URL is only for tests, which point it at a fake Gemini.
  const baseUrl = process.env.GEMINI_BASE_URL;
  return new GoogleGenAI({ apiKey, ...(baseUrl && { httpOptions: { baseUrl } }) });
}

// An error from Gemini, with a readable message and whether trying again might
// help. restMs: the problem is with this model (its limit is reached, it's too
// busy, or it's gone), so rest it that long and ask another model meanwhile.
export class GeminiError extends Error {
  constructor(message, { retryable = false, status, restMs = null } = {}) {
    super(message);
    this.retryable = retryable;
    this.status = status;
    this.restMs = restMs;
  }
}

const MINUTE = 60 * 1000;

// Gemini's error as JSON ({ error: { code, message, details } }), from the SDK's message.
function errorBody(err) {
  const text = String(err.message ?? '');
  try {
    return JSON.parse(text.slice(text.indexOf('{'))).error ?? null;
  } catch {
    return null;
  }
}

// How long a model should rest after hitting a limit. Gemini says which limit
// (per minute or per day) and when to try again. A daily limit is checked again
// every hour rather than waited out, in case it resets sooner.
function restAfterLimit(err) {
  const details = errorBody(err)?.details ?? [];
  const quotaIds = details.flatMap((d) => d.violations ?? []).map((v) => String(v.quotaId ?? ''));
  if (quotaIds.some((id) => /PerDay/i.test(id))) return 60 * MINUTE;
  const delay = details.find((d) => d.retryDelay)?.retryDelay; // "37s"
  const seconds = Number.parseFloat(delay);
  return Number.isFinite(seconds) ? Math.ceil(seconds + 1) * 1000 : MINUTE;
}

function explain(err) {
  const status = err.status ?? err.code;
  const detail = String(err.message ?? err).slice(0, 300);
  if (status === 429) {
    return new GeminiError(`Gemini is busy or the free quota is used up for now. (${detail})`, { retryable: true, status, restMs: restAfterLimit(err) });
  }
  // 503: this model has too much demand right now (others may not).
  if (status === 503) return new GeminiError(`Gemini had a problem on its side. (${detail})`, { retryable: true, status, restMs: MINUTE });
  if (status >= 500) return new GeminiError(`Gemini had a problem on its side. (${detail})`, { retryable: true, status });
  if (status === 401 || status === 403) return new GeminiError(`Gemini refused the API key. Check GEMINI_API_KEY. (${detail})`, { status });
  // A model that isn't there (or not for this key): leave it alone for a day.
  if (status === 404 && /models\//.test(detail)) {
    return new GeminiError(`Gemini doesn't know the model. Check GEMINI_MODEL. (${detail})`, { status, restMs: 24 * 60 * MINUTE });
  }
  if (status === 404) return new GeminiError(`Gemini doesn't know the model or video. Check GEMINI_MODEL. (${detail})`, { status });
  // Gemini answers a wrong key with 400 (API_KEY_INVALID), not 401: say it's the key, not the video.
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(detail)) {
    return new GeminiError("Gemini refused the API key. Check GEMINI_API_KEY on the server (it may be pasted wrong or no longer valid).", { status });
  }
  if (status === 400) return new GeminiError(`Gemini couldn't use this video. Is it public? (${detail})`, { status });
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return new GeminiError('Gemini took too long to answer.', { retryable: true });
  return new GeminiError(`Couldn't reach Gemini. (${detail})`, { retryable: true });
}

// The video: either `youtubeId` (a public YouTube video) or `file` (one
// uploaded with uploadVideo). clipStart/clipEnd in seconds: leave them out to
// send the whole video. fps: frames Gemini looks at per second (default 1;
// 0.5 = one frame every 2 seconds, half the picture tokens). noAudio: the file
// has no sound, so the prompt says to rely on what is seen. soundOnly: the
// file is only the sound, so the prompt says to rely on what is said.
export async function extractPlaces({ youtubeId, file, clipStart = 0, clipEnd = null, model, highDetail, thinkingLevel, fps, noAudio = false, soundOnly = false }) {
  const config = aiConfig();
  model ??= config.model;
  highDetail ??= config.highDetail;
  thinkingLevel ??= config.thinkingLevel;
  const wholeVideo = clipStart === 0 && clipEnd === null;

  const videoPart = {
    fileData: file ? { fileUri: file.uri, mimeType: file.mimeType } : { fileUri: `https://www.youtube.com/watch?v=${youtubeId}` },
  };
  const videoMetadata = {
    ...(!wholeVideo && { startOffset: `${Math.floor(clipStart)}s` }),
    ...(!wholeVideo && clipEnd !== null && { endOffset: `${Math.ceil(clipEnd)}s` }),
    ...(fps && fps !== 1 && { fps }),
  };
  if (Object.keys(videoMetadata).length) videoPart.videoMetadata = videoMetadata;

  let response;
  try {
    response = await client().models.generateContent({
      model,
      contents: [{ role: 'user', parts: [videoPart, { text: buildPrompt({ clipStart, clipEnd, wholeVideo, noAudio, soundOnly }) }] }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: PLACES_SCHEMA,
        mediaResolution: highDetail ? MediaResolution.MEDIA_RESOLUTION_HIGH : MediaResolution.MEDIA_RESOLUTION_LOW,
        ...(thinkingLevel && { thinkingConfig: { thinkingLevel: thinkingLevel.toUpperCase() } }),
      },
    });
  } catch (err) {
    throw explain(err);
  }

  const raw = response.text ?? '';
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new GeminiError('Gemini answered, but not with the JSON we asked for.', { retryable: true });
  }
  return { data, raw, usage: response.usageMetadata ?? {}, model };
}

// Models resting after hitting a limit or being too busy: model name -> until when (ms).
const restingUntil = new Map();

// For tests: forget which models are resting.
export function forgetRestingModels() {
  restingUntil.clear();
}

const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// extractPlaces, but when a model has reached its limit (429), is too busy
// (503) or isn't available (404), the next model in the list is asked at once:
// `model` (or GEMINI_MODEL) first, then GEMINI_FALLBACK_MODELS. A model that
// failed rests for as long as Gemini says, then is used again. Returns what
// extractPlaces returns; `model` says which model answered.
export async function extractPlacesWithFallback(options) {
  const config = aiConfig();
  const chain = [...new Set([options.model ?? config.model, ...config.fallbackModels])];
  const now = Date.now();
  const ready = chain.filter((model) => (restingUntil.get(model) ?? 0) <= now);
  if (ready.length === 0) {
    const soonest = Math.min(...chain.map((model) => restingUntil.get(model)));
    throw new GeminiError(`Every AI model has reached its limit or is busy until about ${clock(soonest)}. TrailCast will try again.`, { retryable: true });
  }
  let lastError;
  for (const model of ready) {
    try {
      return await extractPlaces({ ...options, model });
    } catch (err) {
      // Not about this model (a private video, a bad key): another model won't help.
      if (!(err instanceof GeminiError) || !err.restMs) throw err;
      restingUntil.set(model, Date.now() + err.restMs);
      console.warn(`Gemini ${model} ${err.status === 429 ? 'reached a limit' : err.status === 503 ? 'is too busy' : "isn't available"}; resting it until ${clock(Date.now() + err.restMs)}.`);
      lastError = err;
    }
  }
  throw lastError;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Uploads a video file to Gemini (kept there for up to 48 hours, or until
// deleteUploadedVideo) and waits until Gemini has processed it.
export async function uploadVideo(path, { mimeType = 'video/mp4', pollMs = 5000, timeoutMs = 15 * 60 * 1000 } = {}) {
  const ai = client();
  let file;
  try {
    file = await ai.files.upload({ file: path, config: { mimeType } });
    const giveUpAt = Date.now() + timeoutMs;
    while (file.state === 'PROCESSING') {
      if (Date.now() > giveUpAt) throw new GeminiError('Gemini took too long to process the uploaded video.', { retryable: true });
      await sleep(pollMs);
      file = await ai.files.get({ name: file.name });
    }
  } catch (err) {
    throw err instanceof GeminiError ? err : explain(err);
  }
  if (file.state === 'FAILED') throw new GeminiError("Gemini couldn't process the uploaded video.");
  return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? mimeType };
}

export async function deleteUploadedVideo(name) {
  try {
    await client().files.delete({ name });
  } catch {
    // Not worth failing over: Gemini deletes uploads after 48 hours anyway.
  }
}
