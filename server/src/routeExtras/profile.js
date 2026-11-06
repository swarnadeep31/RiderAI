// Heights along a route, made into the compact profile the elevation chart
// draws, plus the numbers the trip stats use (highest point, climb). Raw
// per-point heights aren't stored: on a 20,000-point trail they'd add about
// 200 KB, so they're used here and dropped.
import { cumulativeDistances } from '../utils/geo.js';

export const MAX_PROFILE_POINTS = 1000;
// Rises and falls smaller than this don't count as climbing, so GPS jitter
// on a flat road doesn't add up to fake climbing.
export const CLIMB_DEAD_BAND_M = 10;
// With more than this share of heights missing, the recording's heights
// aren't trusted and another source is used.
const MAX_MISSING_SHARE = 0.2;

const isHeight = (h) => typeof h === 'number' && Number.isFinite(h);

// Fills missing heights (null) by interpolating over distance; missing ones
// before the first or after the last known height copy the nearest. Returns
// null when there are none, or too many are missing.
export function fillHeights(alongM, heights) {
  const n = heights.length;
  const missing = heights.filter((h) => !isHeight(h)).length;
  if (n === 0 || missing === n || missing / n > MAX_MISSING_SHARE) return null;
  const filled = heights.map((h) => (isHeight(h) ? h : null));
  let previous = -1;
  for (let i = 0; i < n; i++) {
    if (filled[i] !== null) {
      previous = i;
      continue;
    }
    let next = i + 1;
    while (next < n && filled[next] === null) next++;
    for (let j = i; j < next; j++) {
      if (previous < 0) filled[j] = filled[next];
      else if (next >= n) filled[j] = filled[previous];
      else {
        const span = alongM[next] - alongM[previous];
        const f = span > 0 ? (alongM[j] - alongM[previous]) / span : 0;
        filled[j] = filled[previous] + (filled[next] - filled[previous]) * f;
      }
    }
    i = next - 1;
  }
  return filled;
}

// Each value replaced by the middle one of its neighbourhood (removes spikes).
export function median5(values) {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b);
    return window[window.length >> 1];
  });
}

// Each value replaced by the average of itself and its neighbours (smooths noise).
export function mean3(values) {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - 1), i + 2);
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
}

// Total climb and descent, ignoring changes smaller than the dead band.
export function climb(heights, deadBand = CLIMB_DEAD_BAND_M) {
  let reference = heights[0];
  let ascent = 0;
  let descent = 0;
  for (const h of heights) {
    if (h - reference >= deadBand) {
      ascent += h - reference;
      reference = h;
    } else if (reference - h >= deadBand) {
      descent += reference - h;
      reference = h;
    }
  }
  return { ascentM: ascent, descentM: descent };
}

// Heights at `count` evenly spaced distances from the start to the end.
export function resample(alongM, heights, count) {
  const total = alongM.at(-1);
  const d = [];
  const e = [];
  let i = 0;
  for (let j = 0; j < count; j++) {
    const at = count === 1 ? 0 : (total * j) / (count - 1);
    while (i < alongM.length - 2 && alongM[i + 1] < at) i++;
    const span = alongM[i + 1] - alongM[i];
    const f = span > 0 ? Math.min(Math.max((at - alongM[i]) / span, 0), 1) : 0;
    d.push(at);
    e.push(heights[i] + (heights[i + 1] - heights[i]) * f);
  }
  return { d, e };
}

// How many neighbours on each side of value i a centred window can have: up
// to `half`, fewer near the ends, the same number on both sides. So the first
// and last values stay as they are, and a steady slope isn't changed at all.
const reach = (i, length, half) => Math.min(half, i, length - 1 - i);

// Each value replaced by the average of itself and up to `half` values on each side.
export function movingAverage(values, half) {
  const sums = [0];
  for (const v of values) sums.push(sums.at(-1) + v);
  return values.map((_, i) => {
    const k = reach(i, values.length, half);
    return (sums[i + k + 1] - sums[i - k]) / (2 * k + 1);
  });
}

// Each value replaced by the middle one of itself and up to 2 values on each side.
function centredMedian5(values) {
  return values.map((_, i) => {
    const k = reach(i, values.length, 2);
    return values.slice(i - k, i + k + 1).sort((a, b) => a - b)[k];
  });
}

// Heights from a map (OpenRouteService) rather than a recording. On a road
// cut into a steep valley side, the map's height wobbles by tens to hundreds
// of metres within a few hundred metres (388 m within 1 km, on the live Spiti
// ride), and every wobble would count as climbing: that ride showed 19,954 m
// of climb. So they're put on an even grid and averaged over 1.5 km, which
// keeps passes and long climbs (the highest point moved by 15 m) and brings
// it to about 8,600 m. Returns { alongM, heights } on the grid.
export const MAP_GRID_M = 50;
export const MAP_SMOOTHING_M = 1500;
const MAX_GRID_POINTS = 200000; // beyond 10,000 km the grid gets coarser
export function smoothMapHeights(alongM, heights) {
  const total = alongM.at(-1);
  const count = Math.max(2, Math.min(Math.floor(total / MAP_GRID_M) + 1, MAX_GRID_POINTS));
  const { d, e } = resample(alongM, heights, count);
  const half = Math.max(1, Math.round(MAP_SMOOTHING_M / 2 / (total / (count - 1))));
  return { alongM: d, heights: movingAverage(centredMedian5(e), half) };
}

// alongM: metres from the start for each height. source: 'gpx' (the
// recording, which is noisy and gets smoothed), 'ors' (heights OpenRouteService
// gave with a drawn route) or 'dem' (OpenRouteService's elevation service),
// both from a map and smoothed over a longer distance (smoothMapHeights).
// Returns { d, e, source, summary } or null when the heights can't be used.
// The summary comes from the full series: on a 1,000 km trip, the profile's
// 1 km spacing would hide short climbs.
export function buildProfile({ alongM, heights, source }) {
  if (alongM.length < 2 || alongM.at(-1) <= 0) return null;
  const filled = fillHeights(alongM, heights);
  if (!filled) return null;
  const series = source === 'gpx' ? { alongM, heights: mean3(median5(filled)) } : smoothMapHeights(alongM, filled);
  const smooth = series.heights;

  let highest = 0;
  smooth.forEach((h, i) => {
    if (h > smooth[highest]) highest = i;
  });
  const { ascentM, descentM } = climb(smooth);
  const { d, e } = resample(series.alongM, smooth, Math.min(MAX_PROFILE_POINTS, alongM.length));
  return {
    d: d.map((v) => Math.round(v / 10) * 10),
    e: e.map((v) => Math.round(v)),
    source,
    summary: {
      highestM: Math.round(smooth[highest]),
      highestAlongM: Math.round(series.alongM[highest]),
      ascentM: Math.round(ascentM),
      descentM: Math.round(descentM),
    },
  };
}

// The same, for heights that belong to the route's own points.
export function profileForTrack(track, heights, source) {
  if (!Array.isArray(heights) || heights.length !== track.length) return null;
  return buildProfile({ alongM: cumulativeDistances(track), heights, source });
}
