// Maths on the GPS route. A route is a list of [lat, lng] points, and
// trackTimes holds the seconds since the recording started for each point.

// True when the route is a real GPS recording (from a GPX file), not one drawn
// between the key points.
export function isGpxRoute(trail) {
  return trail.track.length > 0 && trail.routeSource !== 'keypoints';
}

// Index of the last time at or before t (binary search), or -1 if t is before them all.
export function indexAtOrBefore(times, t) {
  if (!times.length || t < times[0]) return -1;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// The hidden part of the video (intro, montage...) at time t, if any.
export function hiddenRangeAt(hiddenRanges, t) {
  return hiddenRanges?.find((r) => t >= r.start && t < r.end) ?? null;
}

// Where the rider was `videoTime` seconds into the video, or null if the
// video is outside the GPS recording, in a hidden part, or the route has no times.
export function positionAt(track, trackTimes, videoStartsAt, videoTime, hiddenRanges = []) {
  if (!trackTimes?.length || trackTimes.length !== track.length) return null;
  if (hiddenRangeAt(hiddenRanges, videoTime)) return null;
  const t = videoTime + videoStartsAt;
  if (t < trackTimes[0] || t > trackTimes.at(-1)) return null;

  const lo = indexAtOrBefore(trackTimes, t);
  if (lo === track.length - 1) return track[lo];

  // Move the right fraction of the way towards the next point.
  const span = trackTimes[lo + 1] - trackTimes[lo];
  const f = span > 0 ? (t - trackTimes[lo]) / span : 0;
  const [a, b] = [track[lo], track[lo + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// The part of the route already covered at video time t, ending exactly at
// the rider's position (like the bold line in a cab app).
export function travelledAt(track, trackTimes, videoStartsAt, videoTime) {
  if (!trackTimes?.length || trackTimes.length !== track.length) return [];
  const t = videoTime + videoStartsAt;
  if (t >= trackTimes.at(-1)) return track;
  const i = indexAtOrBefore(trackTimes, t);
  if (i < 0) return [];
  const here = positionAt(track, trackTimes, videoStartsAt, videoTime);
  return here ? [...track.slice(0, i + 1), here] : track.slice(0, i + 1);
}

// Index of the route point closest to `location`.
export function nearestIndex(track, [lat, lng]) {
  // A degree of longitude gets shorter away from the equator.
  const lngScale = Math.cos((lat * Math.PI) / 180);
  let best = -1;
  let bestDistance = Infinity;
  track.forEach(([pLat, pLng], i) => {
    const distance = (pLat - lat) ** 2 + ((pLng - lng) * lngScale) ** 2;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

// [[south, west], [north, east]] around all the given points, or null if there are none.
export function boundsOf(locations) {
  if (locations.length === 0) return null;
  const lats = locations.map((l) => l[0]);
  const lngs = locations.map((l) => l[1]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

// Distances along the route. These have a twin in server/src/utils/geo.js, and
// both are checked against the same cases (server/test/fixtures/route-geometry.json).

const EARTH_RADIUS_M = 6371000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

// Distance in metres between two points, along the Earth's surface.
export function distanceMeters([lat1, lng1], [lat2, lng2]) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

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

// Metres east and north of `origin`. Accurate to well under a metre over a few kilometres.
function toLocal(origin, [lat, lng]) {
  return [(lng - origin[1]) * Math.cos(toRadians(origin[0])) * 111320, (lat - origin[0]) * 110540];
}

// The nearest point on the route to `location`, measured on the segments
// between points (drawn routes can have points kilometres apart).
// Returns { index, fraction, alongM, offM, point }: the segment from point
// `index` to the next, how far along it, metres from the start, metres off
// the route, and the point itself. `from`/`to` limit the search to segments
// starting at those indexes, so dragging follows the road under the finger
// on a road ridden twice.
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
  const i = indexAtOrBefore(cum, alongM);
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
  const i = indexAtOrBefore(trackTimes, t);
  const span = trackTimes[i + 1] - trackTimes[i];
  const f = span > 0 ? (t - trackTimes[i]) / span : 0;
  return cum[i] + (cum[i + 1] - cum[i]) * f;
}

// The video moment when the rider was at (or nearest to) `location` on the
// route: what clicking the route or dragging the marker seeks to.
// route: { track, cum, trackTimes, videoStartsAt, hiddenRanges }.
// Returns null when the route has no times. Otherwise the projection (see
// projectOnTrack) plus `time` (video seconds), `hidden` (the skipped part it
// landed in, if any: the time is moved to its end) and `outside`: 'before'
// or 'after' when the GPS was recording outside the video (the time is
// clamped to the video's start, or a second before its end: a video that
// reaches its very end stops, and playing it again starts it from the top).
export function videoTimeAtLocation(route, location, { window, duration = 0 } = {}) {
  const { track, cum, trackTimes, videoStartsAt = 0, hiddenRanges = [] } = route;
  if (!trackTimes?.length || trackTimes.length !== track.length) return null;
  const projection = projectOnTrack(track, cum, location, window);
  let time = timeAtDistance(cum, trackTimes, projection.alongM) - videoStartsAt;
  const hidden = hiddenRangeAt(hiddenRanges, time);
  if (hidden) time = hidden.end;
  let outside = null;
  if (time < 0) {
    time = 0;
    outside = 'before';
  } else if (duration > 0 && time > duration - 1) {
    if (time > duration) outside = 'after';
    time = Math.max(0, duration - 1);
  }
  return { ...projection, time, hidden, outside };
}
