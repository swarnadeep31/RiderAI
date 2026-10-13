// Settings for the AI route builder, read from the environment (server/.env).
// Read on every call, so tests can change them.

function number(name, fallback) {
  const raw = process.env[name];
  const value = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(value) ? value : fallback;
}

export function aiConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    // "minimal" keeps thinking (charged as output) cheap. Empty: let the model decide.
    thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? 'MINIMAL',
    // High detail reads boards and milestones better, but costs about 3-4x as much.
    highDetail: process.env.AI_HIGH_DETAIL === 'true',
    clipMinutes: number('AI_CLIP_MINUTES', 60),
    maxVideoMinutes: number('AI_MAX_VIDEO_MINUTES', 180),
    minConfidence: number('AI_MIN_CONFIDENCE', 0.5),
    jobsPerUserPerDay: number('AI_JOBS_PER_USER_PER_DAY', 3),
    monthlyBudgetUsd: number('AI_MONTHLY_BUDGET_USD', 5),
    // Waits (seconds) before retrying a failed Gemini call.
    retryDelays: (process.env.AI_RETRY_DELAYS || '30,120,600').split(',').map(Number),
    inrPerUsd: number('AI_INR_PER_USD', 88),
  };
}

export const aiRouteAvailable = () => Boolean(aiConfig().apiKey);
