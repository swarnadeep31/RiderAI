// Drawn routes saved before hidden parts paused the rider (see
// pauseForHiddenParts) have their times spread over the whole video, so the
// marker jumps ahead after each drone shot. Run when the server starts, this
// re-spreads them once. The road itself doesn't change, so nothing worked out
// from it (heights, fuel stops, stats) needs doing again.
import { ROUTE_TIMING, Trail } from '../models/Trail.js';
import { pauseForHiddenParts } from '../utils/geo.js';

// Returns how many routes got new times.
export async function retimeDrawnRoutes() {
  const trails = await Trail.find({ routeSource: 'keypoints', timing: { $ne: ROUTE_TIMING }, 'track.1': { $exists: true } });
  let retimed = 0;
  for (const trail of trails) {
    if (trail.hiddenRanges.length > 0) {
      const route = pauseForHiddenParts({ track: trail.track, trackTimes: trail.trackTimes }, trail.points, trail.hiddenRanges);
      trail.set({ track: route.track, trackTimes: route.trackTimes });
      retimed++;
    }
    trail.timing = ROUTE_TIMING;
    await trail.save();
  }
  return retimed;
}
