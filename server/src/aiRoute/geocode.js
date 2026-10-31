// Finds each AI place on the map. Searches near the previous place, because
// many Indian villages share a name, and inside the trip's area when its start
// and end are known. Flags places that would send the route on a huge detour
// (probably the wrong village), and ones found only far away or only as a
// whole region.
import { searchPlaces } from '../services/places.js';
import { distanceMeters } from '../utils/geo.js';

const DETOUR_FACTOR = 2.5;
const DETOUR_MIN_EXTRA_M = 50000;
// Picking between places with the same name: a match in another state than
// the AI said counts as this much further out of the way, and each step down
// the search's own ranking (bigger, better-known places first) as this much.
const OTHER_STATE_M = 200000;
const RANK_STEP_M = 15000;

const unique = (list) => [...new Set(list.filter(Boolean))];

// Names of whole states and countries ("Welcome to West Bengal"): a search
// may find a village that happens to mention one, but it's no spot on the route.
const REGION_NAMES = new Set(
  [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
    'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
    'Orissa', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Bengal', 'North Bengal', 'Jammu and Kashmir', 'Kashmir', 'Ladakh', 'Lakshadweep', 'Andaman and Nicobar Islands', 'North East',
    'Northeast', 'India', 'Nepal', 'Bhutan', 'Bangladesh', 'Pakistan', 'China', 'Tibet', 'Myanmar', 'Sri Lanka',
  ].map((name) => name.toLowerCase().replace(/[^a-z]/g, '')),
);
const isRegionName = (name) => REGION_NAMES.has(String(name).toLowerCase().replace(/[^a-z]/g, ''));

function queriesFor(candidate) {
  const names = [candidate.name, ...(candidate.altNames ?? [])];
  return unique([
    ...names.map((n) => (candidate.region ? `${n}, ${candidate.region}` : null)),
    ...names,
  ]);
}

// A result that names a whole state or country, not a spot on the way: its
// position is just the middle of the area. (A place exactly on whole degrees
// is one too: the search had nothing better.)
const isVague = (place) => place.coarse || (Number.isInteger(place.lat) && Number.isInteger(place.lng));

// Looks a candidate up by each of its names in turn, near `near` and inside
// `area` (the trip's area, if known). Only when nothing is found there, it
// looks everywhere: then `outside` is true. `vague`: only whole regions were found.
async function lookUp(candidate, { near, area, search }) {
  let vague = null;
  const attempt = async (query, within) => {
    let found;
    try {
      found = await search(query, { ...(near && { near }), ...(within && { within }) });
    } catch (err) {
      // Says why in the server's log: a place search that keeps failing shows every place as "not found".
      console.warn(`Couldn't look up "${query}" on the map: ${err.message}`);
      return [];
    }
    const precise = found.filter((place) => !isVague(place));
    if (precise.length === 0 && found.length) vague ??= found;
    return precise;
  };
  const queries = queriesFor(candidate);
  for (const query of queries) {
    const results = await attempt(query, area);
    if (results.length) return { results };
  }
  if (area) {
    const results = await attempt(queries[0], null);
    if (results.length) return { results, outside: true };
  }
  return { results: vague ?? [], vague: Boolean(vague) };
}

// How far out of the way a match is. With the trip's end known: going from
// the previous place through it to the end, against going straight to the
// end, so a same-named village back near the start loses to the town ahead.
// Without the end: how far it is from the previous place.
function outOfTheWay(match, rank, candidate, previous, end) {
  const here = [match.lat, match.lng];
  let cost = 0;
  if (previous && end) cost = distanceMeters(previous, here) + distanceMeters(here, end) - distanceMeters(previous, end);
  else if (previous) cost = distanceMeters(previous, here);
  // "Gaya, Bihar": the state is the last part of the region.
  const state = candidate.region?.split(',').at(-1).trim().toLowerCase();
  if (state && !String(match.description ?? '').toLowerCase().includes(state)) cost += OTHER_STATE_M;
  return cost + (previous && end ? rank * RANK_STEP_M : 0);
}

// Fills in lat, lng, label and alternatives on each candidate (in place).
// start, end: where the trip starts and ends ({ lat, lng }): the first places
// are looked for near the start, and each match is the one most on the way to
// the end. area: { south, west, north, east }, where the trip goes (see
// tripArea). The trip's start and end (candidate.anchor) are on the map already.
export async function geocodeCandidates(candidates, { search = searchPlaces, onProgress, start = null, end = null, area = null } = {}) {
  const goal = end ? [end.lat, end.lng] : null;
  let previous = start ? [start.lat, start.lng] : null;
  for (const [i, candidate] of candidates.entries()) {
    if (candidate.anchor) {
      if (candidate.checked) previous = [candidate.lat, candidate.lng];
      await onProgress?.(i + 1, candidates.length);
      continue;
    }
    const { results, outside, vague } = await lookUp(candidate, { near: previous, area, search });

    if (results.length === 0) {
      candidate.flags = unique([...candidate.flags, 'not_found']);
      candidate.checked = false;
    } else {
      // The match most on the way from where the trip just was (to its end, if known).
      const costs = new Map(results.map((match, rank) => [match, outOfTheWay(match, rank, candidate, previous, goal)]));
      const [best, ...others] = [...results].sort((a, b) => costs.get(a) - costs.get(b));
      Object.assign(candidate, { lat: best.lat, lng: best.lng, label: best.description });
      candidate.alternatives = others.slice(0, 4).map((r) => ({ name: r.name, label: r.description, lat: r.lat, lng: r.lng }));
      // Found only far from the trip, or only as a whole region: probably not where the rider was.
      const doubt = [outside && 'outside_area', (vague || isRegionName(candidate.name)) && 'region_only'].filter(Boolean);
      if (doubt.length) {
        candidate.flags = unique([...candidate.flags, ...doubt]);
        candidate.checked = false;
      }
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
    // The trip's start and end were confirmed by the owner.
    if (kept[i].anchor) continue;
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
