// Plain functions for the elevation chart and the trip sheet.
import { distanceMeters } from './track.js';

// A round step for an axis that covers `range`: 50, 100, 200, 500, 1000...
export function niceStep(range, maxTicks = 4) {
  const rough = Math.max(range, 1) / maxTicks;
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const m of [1, 2, 5, 10]) if (m * power >= rough) return m * power;
  return 10 * power;
}

// The height axis: from a round number below the lowest point (so the climbs
// show), to one above the highest.
export function heightAxis(heights) {
  const low = Math.min(...heights);
  const high = Math.max(...heights);
  const step = Math.max(50, niceStep(high - low, 3));
  const min = Math.floor(low / step) * step;
  const max = Math.max(Math.ceil(high / step) * step, min + step);
  const ticks = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  return { min, max, ticks };
}

// Round kilometre marks along the bottom, at most `maxTicks` of them.
export function kmTicks(totalM, maxTicks = 5) {
  const totalKm = totalM / 1000;
  const step = niceStep(totalKm, maxTicks);
  const ticks = [];
  for (let km = 0; km <= totalKm + 1e-9; km += step) ticks.push(Math.round(km * 1000) / 1000);
  return ticks;
}

// "2,050"
export const formatMetres = (m) => Math.round(m).toLocaleString('en-US');

// "12.5" or "120"
export const formatKm = (m) => {
  const km = m / 1000;
  return km < 10 ? String(Math.round(km * 10) / 10) : String(Math.round(km));
};

// The name of the key point nearest a location, if one is within `withinM`
// ("Taglang La"), otherwise null. The same rule as the server's trip stats.
export function nameNear(points, location, withinM = 10000) {
  let best = null;
  for (const p of points) {
    const distance = distanceMeters(location, [p.lat, p.lng]);
    if (distance <= withinM && (!best || distance < best.distance)) best = { name: p.name, distance };
  }
  return best?.name ?? null;
}

// The high points that stand out (passes, summits): peaks at least
// `minRiseM` above the lowest point on each side before the route climbs
// higher. Highest first. profile: { d, e }.
export function notablePeaks({ d, e }, { minRiseM = 150, max = 8 } = {}) {
  const peaks = [];
  for (let i = 1; i < e.length - 1; i++) {
    if (!(e[i] >= e[i - 1] && e[i] > e[i + 1])) continue;
    let leftLow = e[i];
    for (let j = i - 1; j >= 0 && e[j] <= e[i]; j--) leftLow = Math.min(leftLow, e[j]);
    let rightLow = e[i];
    for (let j = i + 1; j < e.length && e[j] <= e[i]; j++) rightLow = Math.min(rightLow, e[j]);
    const rise = Math.min(e[i] - leftLow, e[i] - rightLow);
    if (rise >= minRiseM) peaks.push({ alongM: d[i], heightM: e[i], riseM: rise });
  }
  return peaks.sort((a, b) => b.heightM - a.heightM).slice(0, max);
}
