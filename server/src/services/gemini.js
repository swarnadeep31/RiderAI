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

export function buildPrompt({ clipStart, clipEnd, wholeVideo, noAudio = false }) {
  const part = wholeVideo ? 'all' : `the part from ${formatClock(clipStart)} to ${formatClock(clipEnd)}`;
  const timeNote = wholeVideo ? '' : ', counted from the start of the whole video';
  const soundNote = noAudio
    ? ' This copy of the video has NO SOUND: use only what you see, including subtitles and other text on screen.'
    : '';
  return PROMPT.replace('{{part}}', part).replace('{{timeNote}}', timeNote).replace('{{soundNote}}', soundNote);
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

// The video: either `youtubeId` (a public YouTube video) or `file` (one
// uploaded with uploadVideo). clipStart/clipEnd in seconds: leave them out to
// send the whole video. fps: frames Gemini looks at per second (default 1;
// 0.5 = one frame every 2 seconds, half the picture tokens). noAudio: the file
// has no sound, so the prompt says to rely on what is seen.
export async function extractPlaces({ youtubeId, file, clipStart = 0, clipEnd = null, model, highDetail, thinkingLevel, fps, noAudio = false }) {
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
      contents: [{ role: 'user', parts: [videoPart, { text: buildPrompt({ clipStart, clipEnd, wholeVideo, noAudio }) }] }],
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
