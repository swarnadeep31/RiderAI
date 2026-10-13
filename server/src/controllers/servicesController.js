// Services along a trail's route (fuel, mechanics, medical help, ATMs), and
// re-running the route tools' work for a trail.
import { routeConfig } from '../config.js';
import { Job } from '../models/Job.js';
import { RouteServices } from '../models/RouteServices.js';
import { Trail } from '../models/Trail.js';
import { httpError } from '../utils/httpError.js';
import { findOwnTrail } from './trailsController.js';

// How often an owner can ask for the work to be redone, per trail per day.
const ENRICH_PER_TRAIL_PER_DAY = 3;
const startOfTodayUtc = () => new Date(new Date().setUTCHours(0, 0, 0, 0));

// Anyone can read these. Viewing a trail never calls Overpass: only the
// background job does, once per route version.
export async function getServices(req, res) {
  const trail = await Trail.findById(req.params.id).select('track routeVersion');
  if (!trail) throw httpError(404, 'Trail not found.');
  if (!routeConfig().services) return res.json({ status: 'unavailable', reason: 'off' });
  if (trail.track.length < 2) return res.json({ status: 'unavailable', reason: 'no_route' });

  const found = await RouteServices.findOne({ trail: trail._id, routeVersion: trail.routeVersion });
  if (!found) return res.json({ status: 'pending' });
  const { status, routeVersion, items, fuelGaps, computedAt, error, retryAt, reason } = found;
  if (status === 'ready') return res.json({ status, routeVersion, items, fuelGaps, computedAt });
  if (status === 'failed') return res.json({ status, error, retryAt: retryAt ?? null });
  res.json({ status, reason });
}

// Works out the heights, services and stats for the route again, now.
export async function enrichNow(req, res) {
  const trail = await findOwnTrail(req);
  if (trail.track.length < 2) throw httpError(400, 'This trail has no route yet.');
  const today = await Job.countDocuments({ type: 'route-enrich', trail: trail._id, manual: true, createdAt: { $gte: startOfTodayUtc() } });
  if (today >= ENRICH_PER_TRAIL_PER_DAY) {
    throw httpError(429, `The route can be worked out again ${ENRICH_PER_TRAIL_PER_DAY} times a day. Please try again tomorrow.`);
  }
  // Waiting jobs for this trail are replaced by this one.
  await Job.updateMany({ type: 'route-enrich', trail: trail._id, state: 'queued' }, { state: 'cancelled', lockedUntil: new Date(0) });
  const job = await Job.create({ type: 'route-enrich', trail: trail._id, user: req.user._id, routeVersion: trail.routeVersion, stage: 'elevation', manual: true });
  res.status(202).json({ _id: job._id, state: job.state, stage: job.stage, routeVersion: job.routeVersion });
}
