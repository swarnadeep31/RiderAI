// Services along the route (fuel, mechanics, medical help, ATMs): how each
// kind looks, and the words about them. The places come from OpenStreetMap,
// found once per route by the server (see server/src/routeExtras/services.js).
import { formatKm } from './elevation.js';

// The colours were checked for telling apart on a map, but two pairs are
// close for some colour-blind readers, so every icon also has its own symbol.
// The symbol is dark or white, whichever reads better on its colour.
export const SERVICE_KINDS = {
  fuel: { label: 'Fuel', plural: 'Fuel', symbol: 'F', colour: '#1baf7a', ink: '#0b201a' },
  mechanic: { label: 'Mechanic', plural: 'Mechanics', symbol: 'M', colour: '#eda100', ink: '#0b201a' },
  medical: { label: 'Medical', plural: 'Medical help', symbol: '+', colour: '#e87ba4', ink: '#0b201a' },
  atm: { label: 'ATM', plural: 'ATMs', symbol: '₹', colour: '#6250d6', ink: '#ffffff' },
};
export const KIND_ORDER = ['fuel', 'mechanic', 'medical', 'atm'];

// Shown wherever fuel information is.
export const FUEL_CAVEAT = 'Based on OpenStreetMap. Small or new pumps may be missing, and some may be closed: check locally before you ride.';

// "km 110", or "≈ km 110" (rounded to 5 km) on routes drawn between key points.
export function kmAlong(alongM, approximate) {
  if (!approximate) return `km ${formatKm(alongM)}`;
  return `≈ km ${Math.round(alongM / 5000) * 5}`;
}

// "475 km", or "≈ 475 km" rounded to 5 km.
export function kmLength(lengthM, approximate) {
  if (!approximate) return `${formatKm(lengthM)} km`;
  return `≈ ${Math.max(5, Math.round(lengthM / 5000) * 5)} km`;
}

// "after Tandi" / "from the start"
export const afterWhat = (gap) => (gap.afterName === 'the start' ? 'from the start' : `after ${gap.afterName}`);

// "Longest stretch without a mapped fuel station: 365 km, after Tandi (km 110 → km 475)."
export function fuelGapSentence(gap, approximate) {
  if (!gap) return null;
  if (gap.afterName === 'the start' && gap.beforeName === 'the end') return 'No fuel stations mapped along the route.';
  return `Longest stretch without a mapped fuel station: ${kmLength(gap.lengthM, approximate)}, ${afterWhat(gap)} (${kmAlong(
    gap.fromM,
    approximate,
  )} → ${kmAlong(gap.toM, approximate)}).`;
}

// The short version on the stats chip: "Longest without fuel: 365 km, after Tandi".
export function fuelGapChip(gap, approximate) {
  if (!gap) return null;
  if (gap.afterName === 'the start' && gap.beforeName === 'the end') return 'No mapped fuel on the route';
  return `Longest without fuel: ${kmLength(gap.lengthM, approximate)}, ${afterWhat(gap)}`;
}

// The name to show for a place: "HP Petrol Pump", "Indian Oil" or "Fuel station".
export function serviceName(item) {
  return item.name ?? item.brand ?? `${SERVICE_KINDS[item.kind].label === 'Fuel' ? 'Fuel station' : SERVICE_KINDS[item.kind].label}`;
}

// "0.2 km off route", or nothing when it's on the route.
export function offRoute(item) {
  if (item.offM < 100) return null;
  return `${(Math.round(item.offM / 100) / 10).toFixed(1)} km off route`;
}

// The stretches without fuel longer than the warning distance (150 km by default).
export const longGaps = (gaps, warnKm) => (gaps ?? []).filter((gap) => gap.lengthM >= warnKm * 1000);
