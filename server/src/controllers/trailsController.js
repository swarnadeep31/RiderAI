import { Job } from '../models/Job.js';
import { MAX_TRACK_POINTS, ROUTE_STYLES, Trail } from '../models/Trail.js';
import { queueRouteEnrich } from '../routeExtras/enrich.js';
import { routeSegments } from '../services/routing.js';
import { timedTrack } from '../utils/geo.js';
import { httpError } from '../utils/httpError.js';
import { parseYouTubeId } from '../utils/youtube.js';

// Only these fields can be set from a request; anything else in the body is ignored.
const TRAIL_FIELDS = ['title', 'description', 'activity', 'supportUrl', 'track', 'trackTimes', 'recordedAt', 'videoStartsAt'];
const POINT_FIELDS = ['name', 'note', 'time', 'lat', 'lng'];
// Show who added a trail, but nothing else about them.
const OWNER_FIELDS = 'username';

function pick(body, fields) {
  const out = {};
  for (const field of fields) if (body?.[field] !== undefined) out[field] = body[field];
  return out;
}

function youtubeIdFrom(body) {
  const id = parseYouTubeId(body?.youtubeUrl);
  if (!id) throw httpError(400, "That doesn't look like a YouTube video link.");
  return id;
}

async function findTrail(id) {
  const trail = await Trail.findById(id);
  if (!trail) throw httpError(404, 'Trail not found.');
  return trail;
}

// Finds the trail and checks that the logged-in user is the one who added it.
export async function findOwnTrail(req) {
  const trail = await findTrail(req.params.id);
  if (!trail.owner?.equals(req.user._id)) throw httpError(403, 'Only the person who added this trail can change it.');
  return trail;
}

// routeNotice: a message for the user when drawing the route didn't go as asked.
export async function sendTrail(res, trail, { status = 200, routeNotice = null } = {}) {
  await trail.populate('owner', OWNER_FIELDS);
  res.status(status).json({ ...trail.toJSON(), routeNotice });
}

// A route with a new shape gets a new version, so what was worked out for the
// old shape (heights, services along the route, stats) is redone.
function bumpVersionIfReshaped(trail, previousTrack) {
  if (JSON.stringify(trail.track) !== previousTrack) trail.routeVersion += 1;
}

// Saves the trail, and if its route has a new shape, queues the work for it.
export async function saveTrail(trail, previousVersion) {
  await trail.save();
  if (trail.routeVersion !== previousVersion) await queueRouteEnrich(trail);
}

function sortPoints(trail) {
  trail.points.sort((a, b) => a.time - b.time);
  trail.markModified('points');
}

// Draws the route through the key points in video order, with estimated times
// so the map can follow the video. Returns a notice if it fell back to straight lines.
export async function drawRouteFromPoints(trail) {
  const points = [...trail.points].sort((a, b) => a.time - b.time);
  if (points.length < 2) {
    if (trail.track.length > 0) trail.routeVersion += 1;
    trail.set({ track: [], trackTimes: [] });
    return null;
  }
  const previousTrack = JSON.stringify(trail.track);
  const { segments, notice } = await routeSegments(points, trail.routeStyle);
  const { track, trackTimes } = timedTrack(points, segments, MAX_TRACK_POINTS);
  // The times are video times already, so the video and route need no lining up.
  trail.set({ track, trackTimes, routeSource: 'keypoints', videoStartsAt: 0, recordedAt: undefined });
  bumpVersionIfReshaped(trail, previousTrack);
  return notice;
}

// A route drawn from key points is redrawn whenever the key points change.
const redrawIfDrawn = (trail) => (trail.routeSource === 'keypoints' ? drawRouteFromPoints(trail) : null);

export async function listTrails(req, res) {
  // The route can be thousands of points, so leave it out of the list.
  const trails = await Trail.find()
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .select('-track -trackTimes')
    .populate('owner', OWNER_FIELDS)
    .lean();
  res.json(trails);
}

export async function createTrail(req, res) {
  const fields = pick(req.body, TRAIL_FIELDS);
  const trail = new Trail({
    ...fields,
    youtubeId: youtubeIdFrom(req.body),
    owner: req.user._id,
    routeSource: fields.track?.length ? 'gpx' : undefined,
    routeVersion: fields.track?.length ? 1 : 0,
  });
  await saveTrail(trail, 0);
  await sendTrail(res, trail, { status: 201 });
}

export async function getTrail(req, res) {
  await sendTrail(res, await findTrail(req.params.id));
}

export async function updateTrail(req, res) {
  const trail = await findOwnTrail(req);
  const version = trail.routeVersion;
  const previousTrack = JSON.stringify(trail.track);
  const fields = pick(req.body, TRAIL_FIELDS);
  trail.set(fields);
  if (fields.track?.length) trail.routeSource = 'gpx';
  if (fields.track !== undefined) bumpVersionIfReshaped(trail, previousTrack);
  if (req.body?.youtubeUrl !== undefined) trail.youtubeId = youtubeIdFrom(req.body);
  await saveTrail(trail, version);
  await sendTrail(res, trail);
}

export async function deleteTrail(req, res) {
  const trail = await findOwnTrail(req);
  await trail.deleteOne();
  // Work waiting for this trail's route is no longer needed.
  await Job.updateMany({ type: 'route-enrich', trail: trail._id, state: 'queued' }, { state: 'cancelled' });
  res.status(204).end();
}

// Builds (or rebuilds) the route between the key points, for videos without a GPX file.
export async function drawRoute(req, res) {
  const trail = await findOwnTrail(req);
  const style = req.body?.style ?? trail.routeStyle;
  if (!ROUTE_STYLES.includes(style)) throw httpError(400, `The route style must be one of: ${ROUTE_STYLES.join(', ')}.`);
  if (trail.points.length < 2) throw httpError(400, 'Add at least two key points first.');
  const version = trail.routeVersion;
  trail.routeStyle = style;
  const routeNotice = await drawRouteFromPoints(trail);
  await saveTrail(trail, version);
  await sendTrail(res, trail, { routeNotice });
}

export async function addPoint(req, res) {
  const trail = await findOwnTrail(req);
  const version = trail.routeVersion;
  trail.points.push(pick(req.body, POINT_FIELDS));
  sortPoints(trail);
  await trail.validate(); // check the new point before spending time on the route
  const routeNotice = await redrawIfDrawn(trail);
  await saveTrail(trail, version);
  await sendTrail(res, trail, { status: 201, routeNotice });
}

export async function updatePoint(req, res) {
  const trail = await findOwnTrail(req);
  const version = trail.routeVersion;
  const point = trail.points.id(req.params.pointId);
  if (!point) throw httpError(404, 'Key point not found.');
  point.set(pick(req.body, POINT_FIELDS));
  sortPoints(trail);
  await trail.validate();
  const routeNotice = await redrawIfDrawn(trail);
  await saveTrail(trail, version);
  await sendTrail(res, trail, { routeNotice });
}

export async function deletePoint(req, res) {
  const trail = await findOwnTrail(req);
  const version = trail.routeVersion;
  const point = trail.points.id(req.params.pointId);
  if (!point) throw httpError(404, 'Key point not found.');
  point.deleteOne();
  const routeNotice = await redrawIfDrawn(trail);
  await saveTrail(trail, version);
  await sendTrail(res, trail, { routeNotice });
}
