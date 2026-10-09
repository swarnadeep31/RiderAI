import { Trail } from '../models/Trail.js';
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

async function sendTrail(res, trail, status = 200) {
  await trail.populate('owner', OWNER_FIELDS);
  res.status(status).json(trail);
}

function sortPoints(trail) {
  trail.points.sort((a, b) => a.time - b.time);
  trail.markModified('points');
}

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
  const trail = await Trail.create({
    ...pick(req.body, TRAIL_FIELDS),
    youtubeId: youtubeIdFrom(req.body),
    owner: req.user._id,
  });
  await sendTrail(res, trail, 201);
}

export async function getTrail(req, res) {
  await sendTrail(res, await findTrail(req.params.id));
}

export async function updateTrail(req, res) {
  const trail = await findOwnTrail(req);
  trail.set(pick(req.body, TRAIL_FIELDS));
  if (req.body?.youtubeUrl !== undefined) trail.youtubeId = youtubeIdFrom(req.body);
  await trail.save();
  await sendTrail(res, trail);
}

export async function deleteTrail(req, res) {
  const trail = await findOwnTrail(req);
  await trail.deleteOne();
  res.status(204).end();
}

export async function addPoint(req, res) {
  const trail = await findOwnTrail(req);
  trail.points.push(pick(req.body, POINT_FIELDS));
  sortPoints(trail);
  await trail.save();
  await sendTrail(res, trail, 201);
}

export async function updatePoint(req, res) {
  const trail = await findOwnTrail(req);
  const point = trail.points.id(req.params.pointId);
  if (!point) throw httpError(404, 'Key point not found.');
  point.set(pick(req.body, POINT_FIELDS));
  sortPoints(trail);
  await trail.save();
  await sendTrail(res, trail);
}

export async function deletePoint(req, res) {
  const trail = await findOwnTrail(req);
  const point = trail.points.id(req.params.pointId);
  if (!point) throw httpError(404, 'Key point not found.');
  point.deleteOne();
  await trail.save();
  await sendTrail(res, trail);
}
