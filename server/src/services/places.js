// Finds places by name ("Rohtang Pass") using OpenStreetMap's free Nominatim service.
// Its rules: identify the app, at most one search per second, no search-as-you-type,
// and keep results instead of asking again. https://operations.osmfoundation.org/policies/nominatim/
import { httpError } from '../utils/httpError.js';

const nominatimUrl = () => process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'TrailCast/0.1 (+https://github.com/swarnadeep31/RiderAI)';
const MIN_GAP_MS = 1100;
const MAX_CACHED = 500;

const cache = new Map();
let queue = Promise.resolve();
let lastSearchAt = 0;

// near: [lat, lng] to rank places around there first (many villages share a name).
export async function searchPlaces(query, { near } = {}) {
  const key = `${query.trim().toLowerCase()}|${near ? near.map((n) => Math.round(n)).join(',') : ''}`;
  if (cache.has(key)) return cache.get(key);

  // One search at a time for the whole server, at least 1.1 s apart.
  const places = queue.then(async () => {
    const wait = lastSearchAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastSearchAt = Date.now();
    return fetchPlaces(query, near);
  });
  queue = places.catch(() => {});

  const result = await places;
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

export function clearPlaceCache() {
  cache.clear();
}

const NEAR_DEGREES = 1.5; // about 150 km around the "near" point

async function fetchPlaces(query, near) {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', 'accept-language': 'en' });
  if (near) {
    const [lat, lng] = near;
    // A preferred area, not a hard limit (bounded=0): places inside it rank first.
    params.set('viewbox', [lng - NEAR_DEGREES, lat + NEAR_DEGREES, lng + NEAR_DEGREES, lat - NEAR_DEGREES].join(','));
    params.set('bounded', '0');
  }
  let res;
  try {
    res = await fetch(`${nominatimUrl()}/search?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    res = null;
  }
  if (!res?.ok) throw httpError(502, 'Place search is not working right now. Try again in a minute, or click the map instead.');

  const results = await res.json();
  return results
    .map((r) => ({
      name: r.name || String(r.display_name).split(',')[0],
      description: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}
