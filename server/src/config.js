// Settings for the AI route builder, read from the environment (server/.env).
// Read on every call, so tests can change them.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function number(name, fallback) {
  const raw = process.env[name];
  const value = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(value) ? value : fallback;
}

export function aiConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    // Models to switch to, in order, when the main one has reached its limit or
    // is too busy (each model has its own free-tier limits). Comma-separated.
    fallbackModels: (process.env.GEMINI_FALLBACK_MODELS || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
    // "minimal" keeps thinking (charged as output) cheap. Empty: let the model decide.
    thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? 'MINIMAL',
    // A transcript is a small part of a video's tokens, so a stronger model can
    // read it, and think a little (when the ride sets off, what's only talked
    // about), for well under a cent. Flash Lite mixed up places in tests.
    transcriptModel: process.env.GEMINI_TRANSCRIPT_MODEL || 'gemini-3.5-flash',
    transcriptThinkingLevel: process.env.GEMINI_TRANSCRIPT_THINKING_LEVEL ?? 'LOW',
    // High detail reads boards and milestones better, but costs about 3-4x as much.
    highDetail: process.env.AI_HIGH_DETAIL === 'true',
    clipMinutes: number('AI_CLIP_MINUTES', 60),
    maxVideoMinutes: number('AI_MAX_VIDEO_MINUTES', 180),
    minConfidence: number('AI_MIN_CONFIDENCE', 0.5),
    jobsPerUserPerDay: number('AI_JOBS_PER_USER_PER_DAY', 6),
    monthlyBudgetUsd: number('AI_MONTHLY_BUDGET_USD', 5),
    // Waits (seconds) before retrying a failed Gemini call.
    retryDelays: (process.env.AI_RETRY_DELAYS || '30,120,600').split(',').map(Number),
    inrPerUsd: number('AI_INR_PER_USD', 88),
    // Video files uploaded for the AI wait here until their analysis ends.
    uploadDir: process.env.AI_UPLOAD_DIR || join(tmpdir(), 'trailcast-uploads'),
    // Files wait on the server's disk until their analysis ends, so the size
    // and the number waiting at once (all users together) are limited.
    maxUploadMb: number('AI_MAX_UPLOAD_MB', 500),
    maxWaitingUploads: number('AI_MAX_WAITING_UPLOADS', 3),
  };
}

export const aiRouteAvailable = () => Boolean(aiConfig().apiKey);

// Settings for the route tools: heights, services along the route and trip stats.
export function routeConfig() {
  return {
    // Overpass finds fuel stations, mechanics, clinics and ATMs in OpenStreetMap.
    overpassUrl: process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
    // "off" hides services along the route entirely.
    services: process.env.ROUTE_SERVICES !== 'off',
    chunkKm: number('SERVICES_CHUNK_KM', 200),
    fuelGapWarnKm: number('FUEL_GAP_WARN_KM', 150),
    // Wait this long after a route changes before working on it, so a burst of
    // edits (adding key points one by one) is only worked on once.
    enrichDelaySec: number('ROUTE_ENRICH_DELAY_SEC', 30),
  };
}
