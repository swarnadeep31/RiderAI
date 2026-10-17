// Heights for a line of points from OpenRouteService's elevation service. It
// uses the same key as road routing (ORS_API_KEY), and is only on the public
// API, not on a self-hosted OpenRouteService.
import { orsUrl } from './routing.js';

// The most points OpenRouteService takes in one request.
export const MAX_ELEVATION_POINTS = 2000;

export const heightsAvailable = () => Boolean(process.env.ORS_API_KEY);

// locations: [[lat, lng], ...], at most MAX_ELEVATION_POINTS. Returns one
// height in metres (or null) per location.
export async function lineHeights(locations) {
  let res;
  try {
    res = await fetch(`${orsUrl()}/elevation/line`, {
      method: 'POST',
      headers: { Authorization: process.env.ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format_in: 'polyline',
        format_out: 'polyline',
        geometry: locations.map(([lat, lng]) => [lng, lat]), // longitude first
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error("couldn't reach OpenRouteService");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `OpenRouteService answered ${res.status}`);
  const geometry = data?.geometry;
  if (!Array.isArray(geometry) || geometry.length !== locations.length) {
    throw new Error('OpenRouteService sent an unexpected answer');
  }
  return geometry.map((c) => (Number.isFinite(c?.[2]) ? c[2] : null));
}
