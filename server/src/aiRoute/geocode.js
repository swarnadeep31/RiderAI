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

// How much longer the trip gets by going from A through `run` to C, or 0 when
// that's not out of the ordinary.
function detourExtra(a, run, c) {
  const at = (p) => [p.lat, p.lng];
  const direct = distanceMeters(at(a), at(c));
  let via = 0;
  [a, ...run, c].forEach((p, i, path) => {
    if (i > 0) via += distanceMeters(at(path[i - 1]), at(p));
  });
  return via > DETOUR_FACTOR * direct && via - direct > DETOUR_MIN_EXTRA_M ? via - direct : 0;
}

// Places between A and C are suspicious if going through them makes the trip
// much longer. Never judged by speed: vlogs squeeze hours into minutes.
// The worst detour is taken out first and the rest judged again without it.
// When no single place stands out, two in a row are tried together: two wrong
// places next to each other (Nakee La in Tibet, then Pang in Nepal, on a ride
// to Leh) each look fine next to the other.
export function flagDetours(candidates) {
  for (;;) {
    const kept = candidates.filter((c) => c.checked && c.lat !== null);
    let worst = null;
    for (const size of [1, 2]) {
      for (let i = 1; i + size < kept.length; i++) {
        const run = kept.slice(i, i + size);
        // The trip's start and end were confirmed by the owner.
        if (run.some((c) => c.anchor)) continue;
        const extra = detourExtra(kept[i - 1], run, kept[i + size]);
        if (extra > (worst?.extra ?? 0)) worst = { run, extra };
      }
      if (worst) break;
    }
    if (!worst) return candidates;
    for (const c of worst.run) {
      c.flags = unique([...c.flags, 'detour']);
      c.checked = false;
    }
  }
}

// The places in a reviewed list (in video order) that would send the route far
// off its way, by the same rule: [{ name }]. The list itself isn't changed.
export function farOffPlaces(places) {
  const probe = places.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, anchor: p.anchor, checked: true, flags: [] }));
  return flagDetours(probe).filter((p) => p.flags.includes('detour'));
}
