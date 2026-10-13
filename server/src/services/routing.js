// Draws the route between key points: along real roads or footpaths using
// OpenRouteService (free, needs ORS_API_KEY), or as straight lines. Routes
// along roads and footpaths come with heights: [lat, lng, height].

const PROFILES = { roads: 'driving-car', paths: 'foot-hiking' };
const STYLE_NAMES = { roads: 'roads', paths: 'footpaths' };
// Places per request. Longer routes are fetched in pieces.
const MAX_WAYPOINTS = 25;

export const orsUrl = () => process.env.ORS_BASE_URL || 'https://api.openrouteservice.org';
export const roadRoutingAvailable = () => Boolean(process.env.ORS_API_KEY);

const straightSegments = (points) => points.slice(1).map((p, i) => [[points[i].lat, points[i].lng], [p.lat, p.lng]]);

// Returns { segments, notice }: one list of [lat, lng] (or [lat, lng, height])
// from each key point to the next, and a message for the user if the route
// had to fall back to straight lines.
export async function routeSegments(points, style) {
  if (style === 'straight') return { segments: straightSegments(points), notice: null };
  if (!roadRoutingAvailable()) {
    return {
      segments: straightSegments(points),
      notice: `Following ${STYLE_NAMES[style]} needs an OpenRouteService key on the server (ORS_API_KEY in server/.env), so straight lines were drawn for now.`,
    };
  }
  try {
    const segments = [];
    for (let first = 0; first < points.length - 1; first += MAX_WAYPOINTS - 1) {
      segments.push(...(await fetchSegments(points.slice(first, first + MAX_WAYPOINTS), PROFILES[style])));
    }
    return { segments, notice: null };
  } catch (err) {
    return {
      segments: straightSegments(points),
      notice: `Couldn't follow the ${STYLE_NAMES[style]} (${err.message}), so straight lines were drawn instead.`,
    };
  }
}

async function fetchSegments(points, profile) {
  let res;
  try {
    res = await fetch(`${orsUrl()}/v2/directions/${profile}/geojson`, {
      method: 'POST',
      headers: { Authorization: process.env.ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: points.map((p) => [p.lng, p.lat]), // OpenRouteService wants longitude first
        radiuses: points.map(() => -1), // snap each place to the nearest road, however far
        elevation: true, // heights for the elevation chart, at no extra cost
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("couldn't reach OpenRouteService");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `OpenRouteService answered ${res.status}`);

  const route = data?.features?.[0];
  const coordinates = route?.geometry?.coordinates;
  // Where each place we sent is on the returned line.
  const wayPoints = route?.properties?.way_points ?? wayPointsFromSegments(route?.properties?.segments);
  if (!Array.isArray(coordinates) || wayPoints?.length !== points.length) {
    throw new Error('OpenRouteService sent an unexpected answer');
  }

  // [lng, lat] or [lng, lat, height] -> [lat, lng] or [lat, lng, height]
  const line = coordinates.map(([lng, lat, height]) => (Number.isFinite(height) ? [lat, lng, height] : [lat, lng]));
  // Start and end each piece exactly at the key points, so the line touches
  // the pins. A key point takes the height of the road where it was snapped.
  const at = (point, linePoint) => (linePoint?.length > 2 ? [point.lat, point.lng, linePoint[2]] : [point.lat, point.lng]);
  return points.slice(1).map((p, i) => [
    at(points[i], line[wayPoints[i]]),
    ...line.slice(wayPoints[i], wayPoints[i + 1] + 1),
    at(p, line[wayPoints[i + 1]]),
  ]);
}

// Older answers only give way points per step: each leg runs from its first
// step's start to its last step's end.
function wayPointsFromSegments(legs) {
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const ends = legs.map((leg) => leg.steps?.at(-1)?.way_points?.[1]);
  return [legs[0].steps?.[0]?.way_points?.[0] ?? 0, ...ends];
}
