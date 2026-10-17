// Finds each AI place on the map. Searches near the previous place, because
// many Indian villages share a name, and flags places that would send the
// route on a huge detour (probably the wrong village).
import { searchPlaces } from '../services/places.js';
import { distanceMeters } from '../utils/geo.js';

const DETOUR_FACTOR = 2.5;
const DETOUR_MIN_EXTRA_M = 50000;

const unique = (list) => [...new Set(list.filter(Boolean))];

function queriesFor(candidate) {
  const names = [candidate.name, ...(candidate.altNames ?? [])];
  return unique([
    ...names.map((n) => (candidate.region ? `${n}, ${candidate.region}` : null)),
    ...names,
  ]);
}

// Fills in lat, lng, label and alternatives on each candidate (in place).
export async function geocodeCandidates(candidates, { search = searchPlaces, onProgress } = {}) {
  let previous = null;
  for (const [i, candidate] of candidates.entries()) {
    let results = [];
    for (const query of queriesFor(candidate)) {
      try {
        results = await search(query, previous ? { near: previous } : {});
      } catch (err) {
        // Says why in the server's log: a place search that keeps failing shows every place as "not found".
        console.warn(`Couldn't look up "${query}" on the map: ${err.message}`);
        results = [];
      }
      if (results.length) break;
    }

    if (results.length === 0) {
      candidate.flags = unique([...candidate.flags, 'not_found']);
      candidate.checked = false;
    } else {
      // The closest match to where the trip just was.
      const byDistance = previous
        ? [...results].sort((a, b) => distanceMeters(previous, [a.lat, a.lng]) - distanceMeters(previous, [b.lat, b.lng]))
        : results;
      const [best, ...others] = byDistance;
      Object.assign(candidate, { lat: best.lat, lng: best.lng, label: best.description });
      candidate.alternatives = others.slice(0, 4).map((r) => ({ name: r.name, label: r.description, lat: r.lat, lng: r.lng }));
      if (candidate.checked) previous = [best.lat, best.lng];
    }
    await onProgress?.(i + 1, candidates.length);
  }
  flagDetours(candidates);
  return candidates;
}

// Place B between A and C is suspicious if going through it makes the trip
// much longer. Never judged by speed: vlogs squeeze hours into minutes.
export function flagDetours(candidates) {
  const kept = candidates.filter((c) => c.checked && c.lat !== null);
  for (let i = 1; i < kept.length - 1; i++) {
    const [a, b, c] = [kept[i - 1], kept[i], kept[i + 1]].map((p) => [p.lat, p.lng]);
    const direct = distanceMeters(a, c);
    const via = distanceMeters(a, b) + distanceMeters(b, c);
    if (via > DETOUR_FACTOR * direct && via - direct > DETOUR_MIN_EXTRA_M) {
      kept[i].flags = unique([...kept[i].flags, 'detour']);
      kept[i].checked = false;
    }
  }
  return candidates;
}
