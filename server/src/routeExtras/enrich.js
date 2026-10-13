// The route-enrich job: what a route needs beyond its shape, worked out once
// per route version in the background. Stages run in order and each saves
// before the next: heights for the elevation chart, services along the route
// (fuel, mechanics, medical help, ATMs), then the trip stats. Viewers never
// call outside services; they only read what this job saved.
import { routeConfig } from '../config.js';
import { Job } from '../models/Job.js';
import { Trail } from '../models/Trail.js';
import { heightsAvailable, lineHeights, MAX_ELEVATION_POINTS } from '../services/elevation.js';
import { cumulativeDistances, locationAtDistance } from '../utils/geo.js';
import { buildProfile } from './profile.js';
import { computeStats } from './stats.js';

// The outside services, replaceable in tests.
export const defaultEnrichServices = { heightsAvailable, lineHeights };

// The route changed (or the trail was deleted) while the job ran: its work is out of date.
class RouteChanged extends Error {}

async function currentTrail(job) {
  const trail = await Trail.findById(job.trail);
  if (!trail || trail.routeVersion !== job.routeVersion) throw new RouteChanged();
  return trail;
}

// Queues the work for the trail's current route. Called after every change to
// a route: waiting jobs for older versions are cancelled, and a route with a
// job already (queued, running or done) doesn't get a second one.
export async function queueRouteEnrich(trail) {
  await Job.updateMany(
    { type: 'route-enrich', trail: trail._id, state: 'queued', routeVersion: { $ne: trail.routeVersion } },
    { state: 'cancelled', lockedUntil: new Date(0) },
  );
  if (trail.track.length < 2) return null;
  const startAfter = new Date(Date.now() + routeConfig().enrichDelaySec * 1000);
  return Job.findOneAndUpdate(
    { type: 'route-enrich', trail: trail._id, routeVersion: trail.routeVersion, state: { $nin: ['cancelled', 'failed'] } },
    { $setOnInsert: { user: trail.owner, state: 'queued', stage: 'elevation', lockedUntil: startAfter } },
    { upsert: true, returnDocument: 'after' },
  );
}

// Saves something worked out for a route, unless the route changed meanwhile.
async function saveForVersion(job, changes) {
  const { matchedCount } = await Trail.updateOne({ _id: job.trail, routeVersion: job.routeVersion }, { $set: changes });
  if (matchedCount === 0) throw new RouteChanged();
}

// Heights for routes that came without them: straight lines, GPX files without
// heights (or with too many missing), or when road routing failed. The route
// is sent as up to 2,000 evenly spaced points. Heights are a nice extra: if
// they can't be had, the elevation chart is simply not shown.
async function addHeights(job, services) {
  const trail = await currentTrail(job);
  if (trail.elevationProfile?.routeVersion === trail.routeVersion) return;
  if (!services.heightsAvailable()) return;
  const cum = cumulativeDistances(trail.track);
  const total = cum.at(-1);
  if (!(total > 0)) return;
  const count = Math.max(2, Math.min(MAX_ELEVATION_POINTS, trail.track.length));
  const alongM = Array.from({ length: count }, (_, i) => (total * i) / (count - 1));
  let heights;
  try {
    heights = await services.lineHeights(alongM.map((d) => locationAtDistance(trail.track, cum, d)));
  } catch (err) {
    console.warn(`No heights for trail ${trail._id}: ${err.message}`);
    return;
  }
  const profile = buildProfile({ alongM, heights, source: 'dem' });
  if (profile) await saveForVersion(job, { elevationProfile: { ...profile, routeVersion: job.routeVersion } });
}

export async function runEnrichJob(job, services = defaultEnrichServices) {
  try {
    await currentTrail(job);
    if (job.stage === 'elevation') {
      await addHeights(job, services);
      job.stage = 'services';
      await job.save();
    }
    if (job.stage === 'services') {
      job.stage = 'stats';
      await job.save();
    }
    if (job.stage === 'stats') {
      // Now with the heights (and services) the earlier stages found.
      const trail = await currentTrail(job);
      await saveForVersion(job, { stats: computeStats(trail) });
    }
    job.state = 'done';
    job.lockedUntil = new Date(0);
    await job.save();
  } catch (err) {
    if (!(err instanceof RouteChanged)) throw err;
    job.state = 'cancelled';
    job.error = 'The route changed before this finished.';
    job.lockedUntil = new Date(0);
    await job.save();
  }
  return job;
}
