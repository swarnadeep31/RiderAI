// The words on the trip stats chips, and how each number was worked out.
// stats: see server/src/routeExtras/stats.js. A number that isn't known gives
// null, and its chip isn't shown.
import { formatKm, formatMetres } from './elevation.js';

// "475 km", or "≈ 475 km" rounded to 5 km for routes drawn between key points.
export function distanceText(stats) {
  if (!Number.isFinite(stats?.distanceM)) return null;
  if (!stats.approximate) return `${formatKm(stats.distanceM)} km`;
  return `≈ ${Math.max(5, Math.round(stats.distanceM / 5000) * 5)} km`;
}

export function daysText(stats) {
  if (!stats?.days) return null;
  return stats.days === 1 ? '1 day' : `${stats.days} days`;
}

export function highestText(stats) {
  if (!Number.isFinite(stats?.highestM)) return null;
  const where = stats.highestName ?? `at km ${formatKm(stats.highestAlongM)}`;
  return `Highest ${formatMetres(stats.highestM)} m · ${where}`;
}

export function climbText(stats) {
  if (!Number.isFinite(stats?.ascentM)) return null;
  return `${formatMetres(stats.ascentM)} m climb`;
}

const nights = (n) => (n === 1 ? '1 overnight stop' : `${n} overnight stops`);

// What the tooltip on each chip says.
export function explain(stats) {
  return {
    distance: stats?.approximate
      ? 'Measured along the route drawn between the key points, so it is an estimate.'
      : 'Measured along the recorded GPS route.',
    days: {
      owner: 'Set by the creator.',
      gps: `From the GPS recording: ${nights(stats?.nights?.length ?? 0)} (6 hours or more without moving on).`,
      stops: `From the key points marked as overnight stops: ${nights(stats?.nights?.length ?? 0)}.`,
    }[stats?.daysSource],
    highest: 'The highest point of the route. Click to watch that moment.',
    climb: 'Total climb along the route, counting rises of 10 m or more.',
  };
}

// "475 km · 2 days", for trail cards.
export function cardSummary(stats) {
  return [distanceText(stats), daysText(stats)].filter(Boolean).join(' · ');
}
