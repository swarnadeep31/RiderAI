// Reads a GPX file (the standard GPS route format that Strava, Garmin, Komoot
// and most tracking apps export) in the browser.

export const MAX_TRACK_POINTS = 20000; // the server accepts up to this many

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

// Keeps `max` evenly spaced points, always including the first and last.
function downsample(points, max) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

export function parseGpx(text, { maxPoints = MAX_TRACK_POINTS } = {}) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error("This file isn't valid GPX. Try exporting it again.");
  }

  // Recorded tracks use <trkpt>; planned routes use <rtept>.
  let nodes = [...doc.getElementsByTagNameNS('*', 'trkpt')];
  if (nodes.length === 0) nodes = [...doc.getElementsByTagNameNS('*', 'rtept')];

  const points = [];
  for (const node of nodes) {
    const lat = Number(node.getAttribute('lat'));
    const lng = Number(node.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const time = [...node.children].find((child) => child.localName === 'time')?.textContent;
    points.push({ lat, lng, time: time ? Date.parse(time) : NaN });
  }
  if (points.length < 2) throw new Error('No route found in this file. It needs at least two GPS points.');

  const kept = downsample(points, maxPoints);
  // The map can only follow the video if every point has a time, in order.
  const hasTimes = kept.every((p, i) => Number.isFinite(p.time) && (i === 0 || p.time >= kept[i - 1].time));
  const start = kept[0].time;

  return {
    name: doc.querySelector('trk > name, metadata > name')?.textContent.trim() ?? '',
    track: kept.map((p) => [round(p.lat, 6), round(p.lng, 6)]),
    trackTimes: hasTimes ? kept.map((p) => round((p.time - start) / 1000, 1)) : [],
    recordedAt: hasTimes ? new Date(start).toISOString() : null,
  };
}
