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
// key points, time moves on in step with the distance travelled.
// segments[i] runs from points[i] to points[i + 1], as [[lat, lng], ...].
export function timedTrack(points, segments, maxPoints = Infinity) {
  let track = [];
  let trackTimes = [];
  segments.forEach((segment, i) => {
    const start = points[i].time;
    const end = points[i + 1].time;
    const distances = [0];
    for (let j = 1; j < segment.length; j++) distances.push(distances[j - 1] + distanceMeters(segment[j - 1], segment[j]));
    const total = distances.at(-1);
    segment.forEach((location, j) => {
      if (i > 0 && j === 0) return; // the same place the previous piece ended
      const fraction = total > 0 ? distances[j] / total : j / (segment.length - 1);
      track.push([round(location[0], 6), round(location[1], 6)]);
      trackTimes.push(round(start + (end - start) * fraction, 1));
    });
  });

  // Very long routes: keep evenly spaced points, always including the start and end.
  if (track.length > maxPoints) {
    const step = (track.length - 1) / (maxPoints - 1);
    const keep = Array.from({ length: maxPoints }, (_, i) => Math.round(i * step));
    track = keep.map((i) => track[i]);
    trackTimes = keep.map((i) => trackTimes[i]);
  }
  return { track, trackTimes };
}
