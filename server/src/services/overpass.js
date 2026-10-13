// Asks Overpass (a search service for OpenStreetMap data) for places near a
// line. The public servers are free but shared, so TrailCast is polite: one
// request at a time, at least 1.5 seconds apart, with a User-Agent saying who
// it is, and a 30-second wait before retrying when told to slow down.
import { routeConfig } from '../config.js';

const USER_AGENT = 'TrailCast/0.1 (+https://github.com/swarnadeep31/RiderAI)';
const MAX_TRIES = 4; // the first try, plus 3 retries

// Overridable in tests, which don't wait.
const spacingMs = () => Number(process.env.OVERPASS_SPACING_MS ?? 1500);
const retryDelayMs = () => Number(process.env.OVERPASS_RETRY_DELAY_SEC ?? 30) * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestAt = 0;

// An answer from Overpass that wasn't usable.
export class OverpassError extends Error {}

// Runs an Overpass QL query and returns its elements.
export async function runOverpassQuery(query) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + spacingMs() - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    let res;
    try {
      res = await fetch(routeConfig().overpassUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(120000),
      });
    } catch {
      if (attempt < MAX_TRIES) {
        await sleep(retryDelayMs());
        continue;
      }
      throw new OverpassError("Couldn't reach the OpenStreetMap search (Overpass).");
    }
    // 429: too many requests; 406, 503, 504: busy. Wait and try again.
    if ([406, 429, 503, 504].includes(res.status) && attempt < MAX_TRIES) {
      await sleep(retryDelayMs());
      continue;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data?.elements)) {
      throw new OverpassError(`The OpenStreetMap search (Overpass) answered ${res.status}${data?.remark ? `: ${data.remark}` : ''}.`);
    }
    if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) {
      throw new OverpassError(`The OpenStreetMap search (Overpass) gave up: ${data.remark}`);
    }
    return data.elements;
  }
}
