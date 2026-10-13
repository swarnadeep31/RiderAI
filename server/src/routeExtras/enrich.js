// The route-enrich job: what a route needs beyond its shape, worked out once
// per route version in the background. Stages run in order and each saves
// before the next: heights for the elevation chart, services along the route
// (fuel, mechanics, medical help, ATMs), then the trip stats. Viewers never
// call outside services; they only read what this job saved.
import { routeConfig } from '../config.js';
import { Job } from '../models/Job.js';
import { Trail } from '../models/Trail.js';

// The outside services, replaceable in tests.
export const defaultEnrichServices = {};

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

export async function runEnrichJob(job, services = defaultEnrichServices) {
  try {
    await currentTrail(job);
    if (job.stage === 'elevation') {
      job.stage = 'services';
      await job.save();
    }
    if (job.stage === 'services') {
      job.stage = 'stats';
      await job.save();
    }
    if (job.stage === 'stats') {
      await currentTrail(job);
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
