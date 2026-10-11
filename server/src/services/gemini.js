// Asks Gemini to watch (part of) a public YouTube video and list the places
// the traveller passes through. Gemini reads the video from YouTube itself;
// TrailCast never downloads it.
import { readFileSync } from 'node:fs';
import { GoogleGenAI, MediaResolution } from '@google/genai';
import { aiConfig } from '../config.js';
import { formatClock } from '../utils/time.js';

export const PROMPT_VERSION = 'videoPlaces.v1';
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

export function buildPrompt({ clipStart, clipEnd, wholeVideo }) {
  const part = wholeVideo ? 'all' : `the part from ${formatClock(clipStart)} to ${formatClock(clipEnd)}`;
  const timeNote = wholeVideo ? '' : ', counted from the start of the whole video';
  return PROMPT.replace('{{part}}', part).replace('{{timeNote}}', timeNote);
}

function client() {
  const { apiKey } = aiConfig();
  // GEMINI_BASE_URL is only for tests, which point it at a fake Gemini.
  const baseUrl = process.env.GEMINI_BASE_URL;
  return new GoogleGenAI({ apiKey, ...(baseUrl && { httpOptions: { baseUrl } }) });
}

// An error from Gemini, with a readable message and whether trying again might help.
export class GeminiError extends Error {
  constructor(message, { retryable = false, status } = {}) {
    super(message);
    this.retryable = retryable;
    this.status = status;
  }
}

function explain(err) {
  const status = err.status ?? err.code;
  const detail = String(err.message ?? err).slice(0, 300);
  if (status === 429) return new GeminiError(`Gemini is busy or the free quota is used up for now. (${detail})`, { retryable: true, status });
  if (status >= 500) return new GeminiError(`Gemini had a problem on its side. (${detail})`, { retryable: true, status });
  if (status === 401 || status === 403) return new GeminiError(`Gemini refused the API key. Check GEMINI_API_KEY. (${detail})`, { status });
  if (status === 404) return new GeminiError(`Gemini doesn't know the model or video. Check GEMINI_MODEL. (${detail})`, { status });
  if (status === 400) return new GeminiError(`Gemini couldn't use this video. Is it public? (${detail})`, { status });
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return new GeminiError('Gemini took too long to answer.', { retryable: true });
  return new GeminiError(`Couldn't reach Gemini. (${detail})`, { retryable: true });
}

// clipStart/clipEnd in seconds. Leave them out to send the whole video.
export async function extractPlaces({ youtubeId, clipStart = 0, clipEnd = null, model, highDetail, thinkingLevel }) {
  const config = aiConfig();
  model ??= config.model;
  highDetail ??= config.highDetail;
  thinkingLevel ??= config.thinkingLevel;
  const wholeVideo = clipStart === 0 && clipEnd === null;

  const videoPart = { fileData: { fileUri: `https://www.youtube.com/watch?v=${youtubeId}` } };
  if (!wholeVideo) {
    videoPart.videoMetadata = { startOffset: `${Math.floor(clipStart)}s`, ...(clipEnd !== null && { endOffset: `${Math.ceil(clipEnd)}s` }) };
  }

  let response;
  try {
    response = await client().models.generateContent({
      model,
      contents: [{ role: 'user', parts: [videoPart, { text: buildPrompt({ clipStart, clipEnd, wholeVideo }) }] }],
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
