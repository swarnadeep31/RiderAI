// Maths on the GPS route. A route is a list of [lat, lng] points, and
// trackTimes holds the seconds since the recording started for each point.

// Where the rider was `videoTime` seconds into the video, or null if the
// video is outside the GPS recording (or the route has no times).
export function positionAt(track, trackTimes, videoStartsAt, videoTime) {
  if (!trackTimes?.length || trackTimes.length !== track.length) return null;
  const t = videoTime + videoStartsAt;
  if (t < trackTimes[0] || t > trackTimes.at(-1)) return null;

  // Binary search for the last point recorded at or before t.
  let lo = 0;
  let hi = trackTimes.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (trackTimes[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  if (lo === track.length - 1) return track[lo];

  // Move the right fraction of the way towards the next point.
  const span = trackTimes[lo + 1] - trackTimes[lo];
  const f = span > 0 ? (t - trackTimes[lo]) / span : 0;
  const [a, b] = [track[lo], track[lo + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
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
