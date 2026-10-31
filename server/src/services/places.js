// Finds places by name ("Rohtang Pass") using OpenStreetMap's free Nominatim service.
// Its rules: identify the app, at most one search per second, no search-as-you-type,
// and keep results instead of asking again. https://operations.osmfoundation.org/policies/nominatim/
// Nominatim often refuses shared cloud servers (like Render's free plan), so
// when it fails and there's an ORS_API_KEY, OpenRouteService's place search
// answers instead. Nominatim stays first: it knows small Indian places better.
import { httpError } from '../utils/httpError.js';
import { orsUrl } from './routing.js';

const nominatimUrl = () => process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'TrailCast/0.1 (+https://github.com/swarnadeep31/RiderAI)';
const MIN_GAP_MS = 1100;
const MAX_CACHED = 500;

const cache = new Map();
let queue = Promise.resolve();
let lastSearchAt = 0;

// near: [lat, lng] to rank places around there first (many villages share a name).
// within: { south, west, north, east } to find only places inside that box.
// Each place: { name, description, lat, lng, coarse }, where coarse means it's
// a whole state, region or country rather than a spot.
export async function searchPlaces(query, { near, within } = {}) {
  const box = within ? [within.south, within.west, within.north, within.east].map((n) => n.toFixed(1)).join(',') : '';
  const key = `${query.trim().toLowerCase()}|${near ? near.map((n) => Math.round(n)).join(',') : ''}|${box}`;
  if (cache.has(key)) return cache.get(key);

  // One search at a time for the whole server, at least 1.1 s apart.
  const places = queue.then(async () => {
    const wait = lastSearchAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastSearchAt = Date.now();
    return fetchPlaces(query, near, within);
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

async function fetchPlaces(query, near, within) {
  try {
    return await fetchFromNominatim(query, near, within);
  } catch (err) {
    console.warn(`Place search (Nominatim) failed for "${query}": ${err.message}`);
    if (!process.env.ORS_API_KEY) throw httpError(502, 'Place search is not working right now. Try again in a minute, or click the map instead.');
  }
  try {
    return await fetchFromOrs(query, near, within);
  } catch (err) {
    console.warn(`Place search (OpenRouteService) failed for "${query}": ${err.message}`);
    throw httpError(502, 'Place search is not working right now. Try again in a minute, or click the map instead.');
  }
}

// Nominatim's place_rank: 4 a country, 8 a state. A district (10 to 12) still
// places a town on a trip's route well enough: "Aurangabad, Bihar" is often
// only found as its district.
const NOMINATIM_COARSE_RANK = 8;

async function fetchFromNominatim(query, near, within) {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', 'accept-language': 'en' });
  if (within) {
    // Only places inside the box.
    params.set('viewbox', [within.west, within.north, within.east, within.south].join(','));
    params.set('bounded', '1');
  } else if (near) {
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
    throw new Error("couldn't reach it");
  }
  if (!res.ok) throw new Error(`it answered ${res.status}`);

  const results = await res.json();
  return results
    .map((r) => ({
      name: r.name || String(r.display_name).split(',')[0],
      description: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      coarse: Number(r.place_rank) <= NOMINATIM_COARSE_RANK,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

// OpenRouteService's place search (Pelias, from OpenStreetMap and other open
// data). Labels leave out the country: its borders put places in Kashmir in
// Pakistan, though their positions are right.
// OpenRouteService's (Pelias's) layers for whole areas rather than spots.
const ORS_COARSE_LAYERS = new Set(['region', 'macroregion', 'macrocounty', 'country', 'dependency', 'empire', 'continent', 'ocean', 'marinearea']);

async function fetchFromOrs(query, near, within) {
  const params = new URLSearchParams({ text: query, size: '5', lang: 'en' });
  if (within) {
    // Only places inside the box.
    params.set('boundary.rect.min_lat', String(within.south));
    params.set('boundary.rect.min_lon', String(within.west));
    params.set('boundary.rect.max_lat', String(within.north));
    params.set('boundary.rect.max_lon', String(within.east));
  }
  if (near) {
    // Rank places around here first (a preference, not a limit).
    params.set('focus.point.lat', String(near[0]));
    params.set('focus.point.lon', String(near[1]));
  }
  let res;
  try {
    res = await fetch(`${orsUrl()}/geocode/search?${params}`, {
      headers: { Authorization: process.env.ORS_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("couldn't reach it");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `it answered ${res.status}`);
  return (data?.features ?? [])
    .map(({ properties: p = {}, geometry }) => {
      const name = p.name || String(p.label ?? '').split(',')[0];
      return {
        name,
        description: [...new Set([name, p.locality, p.county, p.region].filter(Boolean))].join(', '),
        lat: Number(geometry?.coordinates?.[1]),
        lng: Number(geometry?.coordinates?.[0]),
        coarse: ORS_COARSE_LAYERS.has(p.layer),
      };
    })
    .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
}
