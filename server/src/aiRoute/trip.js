// The trip's start and end, as the trail's owner confirmed them before the
// video was watched (usually read from its title: "Kolkata to Ladakh"). The
// AI's places are pinned between the two: the route starts at the start when
// the ride sets off, the part of the video before that is the intro, and the
// places are looked for in the area around the way from one to the other.
import { distanceMeters } from '../utils/geo.js';
import { mergeHiddenRanges, sameName } from './clean.js';

const isPlace = (place) => Boolean(place?.name) && Number.isFinite(place.lat) && Number.isFinite(place.lng);
const endOf = ({ name, label, lat, lng }) => ({ name, label: label || name, lat, lng });

// What a job is told about the trip, from its trail: { title, start, end }.
export function tripOf(trail, title = trail.videoTitle) {
  return {
    title: String(title ?? '').trim(),
    start: isPlace(trail.startPlace) ? endOf(trail.startPlace) : null,
    end: isPlace(trail.endPlace) ? endOf(trail.endPlace) : null,
  };
}

// The trip as text, so an analysis is only reused for the same trip.
export function tripKey(trip) {
  const key = (place) => (place ? `${place.name.toLowerCase()}@${place.lat.toFixed(3)},${place.lng.toFixed(3)}` : '');
  return trip?.start || trip?.end ? `${key(trip.start)}>${key(trip.end)}` : '';
}

// Close together: a round trip, which may go anywhere in between.
const ROUND_TRIP_M = 100000;

// The box the places are looked for in: around the start and the end, with a
// margin of a quarter of the trip's size, but 1.5° to 3° (about 165 to 330
// km). A round trip has none: { south, west, north, east } or null.
export function tripArea(trip) {
  const { start, end } = trip ?? {};
  if (!isPlace(start) || !isPlace(end)) return null;
  if (distanceMeters([start.lat, start.lng], [end.lat, end.lng]) < ROUND_TRIP_M) return null;
  const span = Math.max(Math.abs(start.lat - end.lat), Math.abs(start.lng - end.lng));
  const margin = Math.min(Math.max(span / 4, 1.5), 3);
  return {
    south: Math.max(Math.min(start.lat, end.lat) - margin, -90),
    west: Math.max(Math.min(start.lng, end.lng) - margin, -180),
    north: Math.min(Math.max(start.lat, end.lat) + margin, 90),
    east: Math.min(Math.max(start.lng, end.lng) + margin, 180),
  };
}

// The start or the end as a place in the review list: on the map already,
// ticked, and taking over the AI's places that were the same place (`same`).
function endCandidate(kind, place, time, same) {
  const leaves = Math.max(...same.map((c) => c.stayUntil ?? c.time), time);
  const found = same.find((c) => c.quote) ?? same[0];
  return {
    id: kind,
    anchor: kind,
    time,
    stayUntil: leaves > time ? leaves : null,
    stopKind: same.some((c) => c.stopKind === 'overnight') ? 'overnight' : (same.find((c) => c.stopKind)?.stopKind ?? null),
    name: place.name,
    region: '',
    altNames: [],
    presence: 'here',
    ...(found?.evidence && { evidence: found.evidence }),
    quote: found?.quote ?? '',
    confidence: 1,
    lat: place.lat,
    lng: place.lng,
    label: place.label || place.name,
    alternatives: [],
    flags: [],
    checked: true,
  };
}

// The ticked places in a row at the start of `list` that are `place` itself.
function leadingRun(list, place) {
  const run = [];
  for (const candidate of list) {
    if (!sameName(candidate.name, place.name)) break;
    run.push(candidate);
  }
  return run;
}

// Pins the trip's start and end onto the cleaned-up AI answer
// ({ candidates, hiddenRanges, startTime, endTime }, see mergeClips).
//
// The start: when the ride sets off (Gemini's start_time, or the first time
// the rider is there, or the end of the intro, or the video's start). Places
// before then are unticked, and that part of the video is the intro.
// The end: when the rider arrives (Gemini's end_time, or the first time they
// are there, or where the video ends), but never before a ticked place.
// Returns { candidates, hiddenRanges }.
export function pinTripEnds({ candidates, hiddenRanges, startTime = null, endTime = null }, trip, duration) {
  const start = isPlace(trip?.start) ? trip.start : null;
  const end = isPlace(trip?.end) ? trip.end : null;
  if (!start && !end) return { candidates, hiddenRanges };
  let list = candidates.map((c) => ({ ...c }));
  let ranges = hiddenRanges.map((r) => ({ ...r }));
  const ticked = () => list.filter((c) => c.checked);
  const pinned = [];

  let setsOff = 0;
  if (start) {
    const same = leadingRun(ticked(), start);
    const intro = ranges.find((r) => r.start <= 5);
    const seen = Math.min(startTime ?? Infinity, same[0]?.time ?? Infinity);
    setsOff = Math.min(Number.isFinite(seen) ? seen : (intro?.end ?? 0), duration);
    list = list.filter((c) => !same.includes(c));
    for (const c of list) {
      if (c.time < setsOff && c.checked) {
        c.checked = false;
        c.flags = [...new Set([...c.flags, 'before_start'])];
      }
    }
    pinned.push(endCandidate('start', start, setsOff, same));
    if (setsOff > 5) ranges = mergeHiddenRanges([...ranges, { start: 0, end: setsOff, reason: 'intro' }]);
  }

  if (end) {
    const same = leadingRun(ticked().reverse(), end).reverse();
    const lastTicked = ticked().filter((c) => !same.includes(c)).at(-1)?.time ?? 0;
    const outro = ranges.find((r) => r.end >= duration - 5 && r.start > setsOff);
    const seen = Math.min(endTime ?? Infinity, same[0]?.time ?? Infinity);
    const arrives = Math.max(Number.isFinite(seen) ? seen : (outro?.start ?? duration), lastTicked, setsOff);
    list = list.filter((c) => !same.includes(c));
    pinned.push(endCandidate('end', end, Math.min(arrives, duration), same));
  }

  // In video order, the start before anything at the same moment and the end after.
  const order = (c) => (c.anchor === 'start' ? -1 : c.anchor === 'end' ? 1 : 0);
  return { candidates: [...list, ...pinned].sort((a, b) => a.time - b.time || order(a) - order(b)), hiddenRanges: ranges };
}
