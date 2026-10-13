// The route-enrich job: what a route needs beyond its shape, worked out once
// per route version in the background. Stages run in order and each saves
// before the next: heights for the elevation chart, services along the route
// (fuel, mechanics, medical help, ATMs), then the trip stats. Viewers never
// call outside services; they only read what this job saved.
import { routeConfig } from '../config.js';
import { Job } from '../models/Job.js';
import { RouteServices } from '../models/RouteServices.js';
import { Trail } from '../models/Trail.js';
import { heightsAvailable, lineHeights, MAX_ELEVATION_POINTS } from '../services/elevation.js';
import { runOverpassQuery } from '../services/overpass.js';
import { cumulativeDistances, locationAtDistance } from '../utils/geo.js';
import { buildProfile } from './profile.js';
import { buildQuery, capItems, chunkRoute, fuelGaps, placeItems, readElements } from './services.js';
import { computeStats } from './stats.js';

// The outside services, replaceable in tests.
export const defaultEnrichServices = { heightsAvailable, lineHeights, overpass: runOverpassQuery };

// When the services search fails, it's tried again this much later, at most this many times.
const SERVICES_RETRY_MS = 6 * 60 * 60 * 1000;
const SERVICES_MAX_RETRIES = 3;

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

// Saves what was found for this route version, clearing what no longer applies.
async function saveServices(job, fields) {
  const clear = Object.fromEntries(['reason', 'error', 'retryAt'].filter((key) => fields[key] === undefined).map((key) => [key, 1]));
  const set = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  await RouteServices.updateOne(
    { trail: job.trail, routeVersion: job.routeVersion },
    { $set: { computedAt: new Date(), ...set }, ...(Object.keys(clear).length && { $unset: clear }) },
    { upsert: true },
  );
}

// Fuel stations, mechanics, medical help and ATMs near the route, from
// OpenStreetMap. The route is sent in pieces of about 200 km, one Overpass
// query each, one at a time; each answer is saved in the job before the next,
// so a restart doesn't ask again. If Overpass fails, it's tried again 6 hours
// later (at most 3 times), and the rest of the page works as normal.
async function findServices(job, services) {
  const trail = await currentTrail(job);
  const config = routeConfig();
  if (!config.services) return;
  // Distances to a straight line drawn between places mean nothing.
  if (trail.routeSource === 'keypoints' && trail.routeStyle === 'straight') {
    await saveServices(job, { status: 'unavailable', reason: 'straight', items: [], fuelGaps: [] });
    return;
  }

  const chunks = chunkRoute(trail.track, { chunkKm: config.chunkKm });
  job.chunks ??= [];
  job.progress = { done: job.chunks.length, total: chunks.length };
  try {
    for (let i = job.chunks.length; i < chunks.length; i++) {
      const elements = await services.overpass(buildQuery(chunks[i]));
      await currentTrail(job); // don't keep asking for a route that has changed
      job.chunks.push(readElements(elements));
      job.progress = { done: i + 1, total: chunks.length };
      job.markModified('chunks');
      await job.save();
    }
  } catch (err) {
    if (err instanceof RouteChanged) throw err;
    const previous = await RouteServices.findOne({ trail: job.trail, routeVersion: job.routeVersion });
    const attempts = (previous?.attempts ?? 0) + 1;
    const retryAt = attempts <= SERVICES_MAX_RETRIES ? new Date(Date.now() + SERVICES_RETRY_MS) : null;
    await saveServices(job, { status: 'failed', error: err.message, retryAt, attempts });
    if (retryAt) {
      await Job.create({ type: 'route-enrich', trail: job.trail, user: job.user, routeVersion: job.routeVersion, stage: 'services', lockedUntil: retryAt });
    }
    return;
  }

  const items = capItems(placeItems(job.chunks.flat(), trail.track));
  const routeLengthM = cumulativeDistances(trail.track).at(-1);
  await saveServices(job, { status: 'ready', items, fuelGaps: fuelGaps(items, routeLengthM, trail.points) });
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
      await findServices(job, services);
      job.stage = 'stats';
      await job.save();
    }
    if (job.stage === 'stats') {
      // Now with the heights and services the earlier stages found.
      const trail = await currentTrail(job);
      const found = await RouteServices.findOne({ trail: job.trail, routeVersion: job.routeVersion, status: 'ready' });
      const longestFuelGap = found?.fuelGaps[0]?.toObject();
      await saveForVersion(job, { stats: computeStats(trail, { longestFuelGap }) });
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
