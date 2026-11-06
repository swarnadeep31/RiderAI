// Asks Overpass (a search service for OpenStreetMap data) for places near a
// line. The public servers are free but shared, so TrailCast is polite: one
// request at a time, at least 1.5 seconds apart, with a User-Agent saying who
// it is. When a server is down or busy, the next one in the list is asked
// (see routeConfig), and coming back round to one already asked waits 30
// seconds first.
import { routeConfig } from '../config.js';

const USER_AGENT = 'TrailCast/0.1 (+https://github.com/swarnadeep31/RiderAI)';
const MAX_TRIES = 4; // the first try, plus 3 retries

// Overridable in tests, which don't wait.
const spacingMs = () => Number(process.env.OVERPASS_SPACING_MS ?? 1500);
const retryDelayMs = () => Number(process.env.OVERPASS_RETRY_DELAY_SEC ?? 30) * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestAt = 0;
// The server that answered last: the next query starts there.
let preferredUrl = null;

// An answer from Overpass that wasn't usable.
export class OverpassError extends Error {}

// Runs an Overpass QL query and returns its elements.
export async function runOverpassQuery(query) {
  const servers = routeConfig().overpassUrls;
  const first = Math.max(servers.indexOf(preferredUrl), 0);
  let failure = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const url = servers[(first + attempt) % servers.length];
    // Back at a server that was already asked: give it time.
    if (attempt >= servers.length) await sleep(retryDelayMs());
    const wait = lastRequestAt + spacingMs() - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(120000),
      });
    } catch {
      failure = new OverpassError("Couldn't reach the OpenStreetMap search (Overpass).");
      continue;
    }
    // 429: too many requests; 406, 503, 504: busy. Try again (elsewhere, if there's another server).
    if ([406, 429, 503, 504].includes(res.status)) {
      failure = new OverpassError(`The OpenStreetMap search (Overpass) is busy (${res.status}).`);
      continue;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data?.elements)) {
      throw new OverpassError(`The OpenStreetMap search (Overpass) answered ${res.status}${data?.remark ? `: ${data.remark}` : ''}.`);
    }
    // An overloaded server gives up on the query: another may manage it.
    if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) {
      failure = new OverpassError(`The OpenStreetMap search (Overpass) gave up: ${data.remark}`);
      continue;
    }
    preferredUrl = url;
    return data.elements;
  }
  throw failure;
}
