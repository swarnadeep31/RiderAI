import { MAX_TRACK_POINTS, ROUTE_STYLES, Trail } from '../models/Trail.js';
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
async function findOwnTrail(req) {
  const trail = await findTrail(req.params.id);
  if (!trail.owner?.equals(req.user._id)) throw httpError(403, 'Only the person who added this trail can change it.');
  return trail;
}

// routeNotice: a message for the user when drawing the route didn't go as asked.
async function sendTrail(res, trail, { status = 200, routeNotice = null } = {}) {
  await trail.populate('owner', OWNER_FIELDS);
  res.status(status).json({ ...trail.toJSON(), routeNotice });
}

function sortPoints(trail) {
  trail.points.sort((a, b) => a.time - b.time);
  trail.markModified('points');
}

// Draws the route through the key points in video order, with estimated times
// so the map can follow the video. Returns a notice if it fell back to straight lines.
async function drawRouteFromPoints(trail) {
  const points = [...trail.points].sort((a, b) => a.time - b.time);
  if (points.length < 2) {
    trail.set({ track: [], trackTimes: [] });
    return null;
  }
  const { segments, notice } = await routeSegments(points, trail.routeStyle);
  const { track, trackTimes } = timedTrack(points, segments, MAX_TRACK_POINTS);
  // The times are video times already, so the video and route need no lining up.
  trail.set({ track, trackTimes, routeSource: 'keypoints', videoStartsAt: 0, recordedAt: undefined });
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
  const trail = await Trail.create({
    ...fields,
    youtubeId: youtubeIdFrom(req.body),
    owner: req.user._id,
    routeSource: fields.track?.length ? 'gpx' : undefined,
  });
  await sendTrail(res, trail, { status: 201 });
}

export async function getTrail(req, res) {
  await sendTrail(res, await findTrail(req.params.id));
}

export async function updateTrail(req, res) {
  const trail = await findOwnTrail(req);
  const fields = pick(req.body, TRAIL_FIELDS);
  trail.set(fields);
  if (fields.track?.length) trail.routeSource = 'gpx';
  if (req.body?.youtubeUrl !== undefined) trail.youtubeId = youtubeIdFrom(req.body);
  await trail.save();
  await sendTrail(res, trail);
}

export async function deleteTrail(req, res) {
  const trail = await findOwnTrail(req);
  await trail.deleteOne();
  res.status(204).end();
}

// Builds (or rebuilds) the route between the key points, for videos without a GPX file.
export async function drawRoute(req, res) {
  const trail = await findOwnTrail(req);
  const style = req.body?.style ?? trail.routeStyle;
  if (!ROUTE_STYLES.includes(style)) throw httpError(400, `The route style must be one of: ${ROUTE_STYLES.join(', ')}.`);
  if (trail.points.length < 2) throw httpError(400, 'Add at least two key points first.');
  trail.routeStyle = style;
  const routeNotice = await drawRouteFromPoints(trail);
  await trail.save();
  await sendTrail(res, trail, { routeNotice });
}

export async function addPoint(req, res) {
  const trail = await findOwnTrail(req);
  trail.points.push(pick(req.body, POINT_FIELDS));
  sortPoints(trail);
  await trail.validate(); // check the new point before spending time on the route
  const routeNotice = await redrawIfDrawn(trail);
  await trail.save();
  await sendTrail(res, trail, { status: 201, routeNotice });
}

export async function updatePoint(req, res) {
  const trail = await findOwnTrail(req);
  const point = trail.points.id(req.params.pointId);
  if (!point) throw httpError(404, 'Key point not found.');
  point.set(pick(req.body, POINT_FIELDS));
  sortPoints(trail);
  await trail.validate();
  const routeNotice = await redrawIfDrawn(trail);
  await trail.save();
  await sendTrail(res, trail, { routeNotice });
}

export async function deletePoint(req, res) {
  const trail = await findOwnTrail(req);
  const point = trail.points.id(req.params.pointId);
  if (!point) throw httpError(404, 'Key point not found.');
  point.deleteOne();
  const routeNotice = await redrawIfDrawn(trail);
  await trail.save();
  await sendTrail(res, trail, { routeNotice });
}
