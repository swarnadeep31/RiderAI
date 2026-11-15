// Render's free plan puts the server to sleep after 15 minutes without
// visitors: the next visitor waits up to a minute, and background work (AI
// analyses, fuel stop searches) stops meanwhile. So, on Render, the server
// visits itself: every 10 minutes it asks its own public address for
// /api/health, which comes in through Render like any visitor's request.
// Render sets RENDER_EXTERNAL_URL; KEEP_AWAKE_URL can name another address,
// and KEEP_AWAKE=off switches it off.
//
// An always-awake service uses about 744 of the 750 free hours Render gives
// a workspace each month: fine for this one service, not for two.
export function startKeepAwake({
  url = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL,
  intervalMs = (Number(process.env.KEEP_AWAKE_MINUTES) || 10) * 60 * 1000,
} = {}) {
  if (!url || process.env.KEEP_AWAKE === 'off') return () => {};
  const health = new URL('/api/health', url).toString();
  const visit = () =>
    fetch(health, { signal: AbortSignal.timeout(30000) }).catch((err) => console.warn(`Keep-awake visit to ${health} failed: ${err.message}`));
  const timer = setInterval(visit, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
