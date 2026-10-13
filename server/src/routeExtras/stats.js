// The trip stats under a trail's title: distance, riding days, highest point,
// total climb and the longest stretch without fuel. Worked out from what the
// trail already has (no outside calls), whenever it's saved, and again by the
// route-enrich job once heights and services are in. A number that can't be
// known is left out: no blanks, no guesses.
import { cumulativeDistances, distanceMeters, locationAtDistance } from '../utils/geo.js';

// A rest: at least 6 hours in which the rider moves less than 1 km. That
// catches a recording paused overnight and a phone left recording at the hotel.
const REST_MIN_SEC = 6 * 3600;
const REST_MAX_MOVE_M = 1000;
// Places are named after the nearest key point this close.
export const NAME_WITHIN_M = 10000;

// Metres between two nearby points, quickly (flat approximation), squared.
function nearDistanceSquared([lat1, lng1], [lat2, lng2]) {
  const x = (lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180) * 111320;
  const y = (lat2 - lat1) * 110540;
  return x * x + y * y;
}

// The rests in a timed GPS route: [{ index, endIndex }], where the rider
// stayed within 1 km of point `index` until point `endIndex`.
export function restPeriods(track, trackTimes) {
  const rests = [];
  const limit = REST_MAX_MOVE_M ** 2;
  let i = 0;
  while (i < track.length - 1) {
    let j = i + 1;
    let isRest = false;
    while (j < track.length && nearDistanceSquared(track[i], track[j]) < limit) {
      if (trackTimes[j] - trackTimes[i] >= REST_MIN_SEC) isRest = true;
      j++;
    }
    if (isRest) {
      rests.push({ index: i, endIndex: j - 1 });
      i = j;
    } else if (j === track.length) {
      // Still within 1 km at the end of the recording, but not for 6 hours:
      // starting later can only be shorter (a climb on one crag, a city ride).
      break;
    } else {
      i++;
    }
  }
  return rests;
}

// The key point nearest a location, if one is within `withinM`.
export function nearestPointName(points, location, withinM = NAME_WITHIN_M) {
  let best = null;
  for (const p of points ?? []) {
    const distance = distanceMeters(location, [p.lat, p.lng]);
    if (distance <= withinM && (!best || distance < best.distance)) best = { name: p.name, distance };
  }
  return best?.name ?? null;
}

const isGpsWithTimes = (trail) =>
  trail.routeSource !== 'keypoints' && trail.trackTimes?.length > 0 && trail.trackTimes.length === trail.track.length;

// Riding days and the nights in between, by the first rule that applies:
// 1. the owner's number; 2. rests in a timed GPS recording; 3. key points
// marked as overnight stops. Otherwise unknown.
export function ridingDays(trail, cum) {
  if (trail.daysOverride) return { days: trail.daysOverride, daysSource: 'owner', nights: [] };
  if (isGpsWithTimes(trail)) {
    const nights = restPeriods(trail.track, trail.trackTimes).map(({ index }) => {
      const location = trail.track[index];
      return { alongM: Math.round(cum[index]), name: nearestPointName(trail.points, location) };
    });
    return { days: nights.length + 1, daysSource: 'gps', nights };
  }
  const overnight = (trail.points ?? []).filter((p) => p.stopKind === 'overnight');
  if (overnight.length > 0) {
    const nights = [...overnight]
      .sort((a, b) => a.time - b.time)
      .map((p) => {
        // Where the route passes closest to the stop.
        let best = 0;
        trail.track.forEach((location, i) => {
          if (distanceMeters(location, [p.lat, p.lng]) < distanceMeters(trail.track[best], [p.lat, p.lng])) best = i;
        });
        return { alongM: Math.round(cum[best] ?? 0), name: p.name };
      });
    return { days: nights.length + 1, daysSource: 'stops', nights };
  }
  return { days: undefined, daysSource: undefined, nights: [] };
}

// All the stats for the trail as it is now. longestFuelGap comes from the
// services along the route (or the stats already saved for this route version).
export function computeStats(trail, { longestFuelGap } = {}) {
  const version = trail.routeVersion ?? 0;
  const stats = { routeVersion: version, approximate: trail.routeSource === 'keypoints', nights: [], updatedAt: new Date() };
  if (!trail.track || trail.track.length < 2) return stats;

  const cum = cumulativeDistances(trail.track);
  stats.distanceM = Math.round(cum.at(-1));
  const { days, daysSource, nights } = ridingDays(trail, cum);
  Object.assign(stats, { days, daysSource, nights });

  const summary = trail.elevationProfile?.routeVersion === version ? trail.elevationProfile.summary : null;
  if (summary) {
    stats.highestM = summary.highestM;
    stats.highestAlongM = summary.highestAlongM;
    stats.ascentM = summary.ascentM;
    stats.descentM = summary.descentM;
    stats.highestName = nearestPointName(trail.points, locationAtDistance(trail.track, cum, summary.highestAlongM)) ?? undefined;
  }

  const gap = longestFuelGap ?? (trail.stats?.routeVersion === version ? trail.stats.longestFuelGap : undefined);
  if (gap?.lengthM !== undefined) stats.longestFuelGap = gap;
  return stats;
}
