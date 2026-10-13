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

// Joins the route pieces between neighbouring key points into one track, and
// estimates when (in video seconds) each track point is passed: between two
// key points, time moves on in step with the distance travelled. A key point
// with stayUntil is a stop: the marker waits there, then rides on.
// segments[i] runs from points[i] to points[i + 1], as [[lat, lng], ...] or
// [[lat, lng, height], ...]. Returns trackElevations too: one height (or
// null) per track point.
export function timedTrack(points, segments, maxPoints = Infinity) {
  let track = [];
  let trackTimes = [];
  let trackElevations = [];
  const push = (location, time) => {
    track.push([round(location[0], 6), round(location[1], 6)]);
    trackTimes.push(round(time, 1));
    trackElevations.push(Number.isFinite(location[2]) ? round(location[2], 1) : null);
  };
  // Leave a stop when it ends, but never later than reaching the next place.
  const departure = (point, next) => Math.min(Math.max(point.stayUntil ?? point.time, point.time), next ? next.time : Infinity);

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
