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

// Joins the route pieces between neighbouring key points into one track, and
// estimates when (in video seconds) each track point is passed: between two
// key points, time moves on in step with the distance travelled. A key point
// with stayUntil is a stop: the marker waits there, then rides on.
// segments[i] runs from points[i] to points[i + 1], as [[lat, lng], ...].
export function timedTrack(points, segments, maxPoints = Infinity) {
  let track = [];
  let trackTimes = [];
  const push = (location, time) => {
    track.push([round(location[0], 6), round(location[1], 6)]);
    trackTimes.push(round(time, 1));
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
  if (segments.length > 0 && last.stayUntil > last.time) push(track.at(-1), last.stayUntil);

  // Very long routes: keep evenly spaced points, always including the start and end.
  if (track.length > maxPoints) {
    const step = (track.length - 1) / (maxPoints - 1);
    const keep = Array.from({ length: maxPoints }, (_, i) => Math.round(i * step));
    track = keep.map((i) => track[i]);
    trackTimes = keep.map((i) => trackTimes[i]);
  }
  return { track, trackTimes };
}
