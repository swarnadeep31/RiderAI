// Maths on [lat, lng] points.

const EARTH_RADIUS_M = 6371000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

// Distance in metres between two points, along the Earth's surface.
export function distanceMeters([lat1, lng1], [lat2, lng2]) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// The route maths below has a twin in client/src/lib/track.js. Both are
// checked against the same cases (test/fixtures/route-geometry.json).

// cum[i] = metres from the start of the route to point i.
export function cumulativeDistances(track) {
  const cum = track.length ? [0] : [];
  for (let i = 1; i < track.length; i++) cum.push(cum[i - 1] + distanceMeters(track[i - 1], track[i]));
  return cum;
}

// First index whose value is >= target (values never go down).
function lowerBound(values, target) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Last index whose value is <= target, or -1.
function upperIndex(values, target) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

// Metres east and north of `origin`. Accurate to well under a metre over a few kilometres.
function toLocal(origin, [lat, lng]) {
  return [(lng - origin[1]) * Math.cos(toRadians(origin[0])) * 111320, (lat - origin[0]) * 110540];
}

// The nearest point on the route to `location`, measured on the segments
// between points (drawn routes can have points kilometres apart).
// Returns { index, fraction, alongM, offM, point }: the segment from point
// `index` to the next, how far along it, metres from the start, metres off
// the route, and the point itself. `from`/`to` limit the search to segments
// starting at those indexes (dragging along a road ridden twice needs this).
export function projectOnTrack(track, cum, location, { from = 0, to = Infinity } = {}) {
  if (track.length === 0) return null;
  if (track.length === 1) return { index: 0, fraction: 0, alongM: 0, offM: distanceMeters(location, track[0]), point: track[0] };
  const first = Math.max(0, Math.min(from, track.length - 2));
  const last = Math.max(first, Math.min(to, track.length - 2));
  let best = null;
  for (let i = first; i <= last; i++) {
    const a = track[i];
    const [bx, by] = toLocal(a, track[i + 1]);
    const [px, py] = toLocal(a, location);
    const lengthSquared = bx * bx + by * by;
    const fraction = lengthSquared > 0 ? Math.min(Math.max((px * bx + py * by) / lengthSquared, 0), 1) : 0;
    const dx = px - bx * fraction;
    const dy = py - by * fraction;
    const flatOff = dx * dx + dy * dy;
    if (!best || flatOff < best.flatOff) best = { index: i, fraction, flatOff };
  }
  const { index, fraction } = best;
  const [a, b] = [track[index], track[index + 1]];
  const point = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  return {
    index,
    fraction,
    alongM: cum[index] + (cum[index + 1] - cum[index]) * fraction,
    offM: distanceMeters(location, point),
    point,
  };
}

// The [lat, lng] that many metres along the route.
export function locationAtDistance(track, cum, alongM) {
  if (track.length === 0) return null;
  if (alongM <= 0) return track[0];
  if (alongM >= cum.at(-1)) return track.at(-1);
  const i = upperIndex(cum, alongM);
  const span = cum[i + 1] - cum[i];
  const f = span > 0 ? (alongM - cum[i]) / span : 0;
  const [a, b] = [track[i], track[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// The recording time when the rider was that many metres along the route.
// At a stop (the same place twice), the arrival time.
export function timeAtDistance(cum, trackTimes, alongM) {
  if (cum.length === 0) return null;
  const target = Math.min(Math.max(alongM, 0), cum.at(-1));
  const i = lowerBound(cum, target);
  if (i === 0 || cum[i] === target) return trackTimes[i];
  const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return trackTimes[i - 1] + (trackTimes[i] - trackTimes[i - 1]) * f;
}

// The inverse: metres along the route at that recording time.
export function distanceAtTime(cum, trackTimes, t) {
  if (cum.length === 0) return null;
  if (t <= trackTimes[0]) return cum[0];
  if (t >= trackTimes.at(-1)) return cum.at(-1);
  const i = upperIndex(trackTimes, t);
  const span = trackTimes[i + 1] - trackTimes[i];
  const f = span > 0 ? (t - trackTimes[i]) / span : 0;
  return cum[i] + (cum[i + 1] - cum[i]) * f;
}

// Douglas–Peucker: the indexes of the points to keep so the line never moves
// more than toleranceM metres. Always keeps the first and last point.
export function simplify(track, toleranceM) {
  if (track.length <= 2) return track.map((_, i) => i);
  const keep = new Uint8Array(track.length);
  keep[0] = 1;
  keep[track.length - 1] = 1;
  const stack = [[0, track.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const [bx, by] = toLocal(track[start], track[end]);
    const lengthSquared = bx * bx + by * by;
    let worst = -1;
    let worstOff = 0;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = toLocal(track[start], track[i]);
      const f = lengthSquared > 0 ? Math.min(Math.max((px * bx + py * by) / lengthSquared, 0), 1) : 0;
      const off = Math.hypot(px - bx * f, py - by * f);
      if (off > worstOff) {
        worst = i;
        worstOff = off;
      }
    }
    if (worst !== -1 && worstOff > toleranceM) {
      keep[worst] = 1;
      stack.push([start, worst], [worst, end]);
    }
  }
  return [...keep.keys()].filter((i) => keep[i]);
}

// Routes drawn along roads come with a point every few metres. Thinning each
// piece to within toleranceM of the road keeps its shape, and the key points
// at its ends, and makes it several times lighter to send and to draw. A
// route that still has more than maxPoints is thinned more, until it fits.
export function thinSegments(segments, maxPoints = Infinity, toleranceM = 5) {
  for (let tolerance = toleranceM; ; tolerance *= 2) {
    const thinned = segments.map((segment) => simplify(segment, tolerance).map((i) => segment[i]));
    const total = thinned.reduce((sum, segment) => sum + segment.length, 0);
    if (total <= maxPoints || tolerance > 10000) return thinned;
  }
}

// Joins the route pieces between neighbouring key points into one track, and
// estimates when (in video seconds) each track point is passed: between two
// key points, time moves on in step with the distance travelled. A key point
// with stayUntil is a stop: the marker waits there, then rides on.
// segments[i] runs from points[i] to points[i + 1], as [[lat, lng], ...] or
// [[lat, lng, height], ...]. Returns trackElevations too: one height (or
// null) per track point.
// Leave a stop when it ends, but never later than reaching the next place.
const departure = (point, next) => Math.min(Math.max(point.stayUntil ?? point.time, point.time), next ? next.time : Infinity);

export function timedTrack(points, segments, maxPoints = Infinity) {
  let track = [];
  let trackTimes = [];
  let trackElevations = [];
  const push = (location, time) => {
    // 5 decimals: about a metre, closer than any drawn route is.
    track.push([round(location[0], 5), round(location[1], 5)]);
    trackTimes.push(round(time, 1));
    trackElevations.push(Number.isFinite(location[2]) ? round(location[2], 1) : null);
  };
  segments.forEach((segment, i) => {
    const arrive = points[i].time;
    const depart = departure(points[i], points[i + 1]);
    const end = points[i + 1].time;
    const distances = [0];
    for (let j = 1; j < segment.length; j++) distances.push(distances[j - 1] + distanceMeters(segment[j - 1], segment[j]));
    const total = distances.at(-1);
    segment.forEach((location, j) => {
      if (j === 0) {
        // The previous piece already ended here, at the arrival time.
        if (i === 0) push(location, arrive);
        // The same place at two times: the marker waits there.
        if (depart > arrive) push(location, depart);
        return;
      }
      const fraction = total > 0 ? distances[j] / total : j / (segment.length - 1);
      push(location, depart + (end - depart) * fraction);
    });
  });

  // A stop at the very last place keeps the marker there until it ends.
  const last = points.at(-1);
  if (segments.length > 0 && last.stayUntil > last.time) push([...track.at(-1), trackElevations.at(-1)], last.stayUntil);

  // Very long routes: keep evenly spaced points, always including the start and end.
  if (track.length > maxPoints) {
    const step = (track.length - 1) / (maxPoints - 1);
    const keep = Array.from({ length: maxPoints }, (_, i) => Math.round(i * step));
    track = keep.map((i) => track[i]);
    trackTimes = keep.map((i) => trackTimes[i]);
    trackElevations = keep.map((i) => trackElevations[i]);
  }
  return { track, trackTimes, trackElevations };
}

// The parts of the video between two places that aren't riding (a drone
// montage, a recap, a flashback) shouldn't move the rider along the road:
// otherwise the marker carries on unseen and jumps ahead when the riding
// footage is back. This re-spreads a drawn route's times (from timedTrack)
// over the riding time only, and makes the marker wait where it was during
// each such part (the same point twice: at its start and at its end).
// route: { track, trackTimes, trackElevations? }; points: the key points;
// hiddenRanges: [{ start, end }]. Returns a new { track, trackTimes, trackElevations }.
export function pauseForHiddenParts(route, points, hiddenRanges = []) {
  const { track, trackTimes } = route;
  const heights = route.trackElevations ?? null;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  // Each stretch between two places, with the hidden parts inside it on the riding clock.
  const stretches = sorted.slice(0, -1).map((point, i) => {
    const from = departure(point, sorted[i + 1]);
    const to = sorted[i + 1].time;
    const pauses = [];
    for (const range of [...hiddenRanges].sort((a, b) => a.start - b.start)) {
      const start = Math.max(range.start, from, pauses.at(-1)?.end ?? -Infinity);
      const end = Math.min(range.end, to);
      if (end > start) pauses.push({ start, end });
    }
    let paused = 0;
    for (const pause of pauses) {
      pause.at = pause.start - from - paused; // riding seconds into the stretch where it starts
      paused += pause.end - pause.start;
    }
    const riding = to - from - paused;
    return { from, to, riding, pauses: riding > 0 ? pauses : [] };
  });
  const stretchOf = (t) => stretches.find((s) => s.pauses.length && t > s.from && t <= s.to) ?? null;
  // Riding seconds into the stretch for a time spread over the whole stretch, and back to video time.
  const ridingAt = (s, t) => (t <= s.from ? 0 : ((t - s.from) / (s.to - s.from)) * s.riding);
  const videoAt = (s, r) => s.from + r + s.pauses.reduce((sum, p) => sum + (p.at < r ? p.end - p.start : 0), 0);

  const out = { track: [], trackTimes: [], trackElevations: [] };
  const push = (location, time, height) => {
    out.track.push(location);
    out.trackTimes.push(round(time, 1));
    out.trackElevations.push(height ?? null);
  };
  const emitted = new Set();
  track.forEach((location, k) => {
    const s = stretchOf(trackTimes[k]);
    if (!s) return push(location, trackTimes[k], heights?.[k]);
    const r = ridingAt(s, trackTimes[k]);
    const r0 = k > 0 && trackTimes[k - 1] > s.from ? ridingAt(s, trackTimes[k - 1]) : 0;
    const atEnd = trackTimes[k] >= s.to;
    // The marker waits wherever a hidden part starts between the last point and this one.
    for (const pause of s.pauses) {
      if (emitted.has(pause) || pause.at < r0 || pause.at > r || (pause.at === r && !atEnd)) continue;
      emitted.add(pause);
      const f = r > r0 ? (pause.at - r0) / (r - r0) : 1;
      const [a, b] = [track[k - 1] ?? location, location];
      const here = [round(a[0] + (b[0] - a[0]) * f, 5), round(a[1] + (b[1] - a[1]) * f, 5)];
      const ha = heights?.[k - 1];
      const hb = heights?.[k];
      const height = Number.isFinite(ha) && Number.isFinite(hb) ? round(ha + (hb - ha) * f, 1) : null;
      push(here, pause.start, height);
      push(here, pause.end, height);
    }
    push(location, atEnd ? s.to : videoAt(s, r), heights?.[k]);
  });
  return out;
}
