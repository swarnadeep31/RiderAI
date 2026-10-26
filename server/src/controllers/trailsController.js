import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { RouteServices } from '../models/RouteServices.js';
import { ROUTE_STYLES, Trail } from '../models/Trail.js';
import { queueRouteEnrich } from '../routeExtras/enrich.js';
import { profileForTrack } from '../routeExtras/profile.js';
import { routeSegments } from '../services/routing.js';
import { fetchChannel, fetchVideoInfo } from '../services/youtubeInfo.js';
import { thinSegments, timedTrack } from '../utils/geo.js';
import { httpError } from '../utils/httpError.js';
import { concurrencyLimit } from '../utils/limit.js';
import { parseYouTubeId } from '../utils/youtube.js';

// Only these fields can be set from a request; anything else in the body is ignored.
const TRAIL_FIELDS = [
  'title',
  'description',
  'activity',
  'supportUrl',
  'track',
  'trackTimes',
  'recordedAt',
  'videoStartsAt',
  'daysOverride',
  'creatorName',
  'videoTitle',
  'startPlace',
  'endPlace',
];
const POINT_FIELDS = ['name', 'note', 'time', 'lat', 'lng', 'stopKind'];
// Only who owns a trail (so the page knows who may edit it), not their name:
// the page credits the video's creator instead.
const OWNER_FIELDS = '_id';

// What the home page's cards need: not the route, the description, or the key
// points themselves (only whether the AI found them).
const CARD_FIELDS = 'title activity youtubeId creatorName channel routeSource stats owner createdAt points.origin';
const LIST_PAGE = 24;
const LIST_MAX = 100;

// Trails are read for viewing as plain data rather than full Mongoose
// documents: a long GPS route as a document holds about 15 MB while it is
// sent, as plain data about 3 MB. Plain data skips the schema's defaults, so
// a trail saved before a field existed gets these (kept equal to Trail.js by a test).
export const TRAIL_DEFAULTS = {
  description: '',
  activity: 'ride',
  creatorName: '',
  videoTitle: '',
  supportUrl: '',
  track: [],
  trackTimes: [],
  videoStartsAt: 0,
  routeVersion: 0,
  routeStyle: 'roads',
  points: [],
  hiddenRanges: [],
};
export const POINT_DEFAULTS = { note: '', origin: 'manual' };

export function withDefaults(trail) {
  const filled = { ...TRAIL_DEFAULTS, ...trail };
  filled.points = filled.points.map((point) => ({ ...POINT_DEFAULTS, ...point }));
  return filled;
}

// A few full trails are read and sent at once; the rest of a crowd waits its turn.
const trailReads = concurrencyLimit(6, { maxWaiting: 150 });

function pick(body, fields) {
  const out = {};
  for (const field of fields) if (body?.[field] !== undefined) out[field] = body[field];
  return out;
}

// Heights sent with a GPX route: one per route point, a number or null.
function elevationsFrom(body, track) {
  const heights = body?.trackElevations;
  if (heights === undefined || heights === null) return null;
  const valid =
    Array.isArray(heights) && heights.length === track.length && heights.every((h) => h === null || (typeof h === 'number' && Number.isFinite(h)));
  if (!valid) throw httpError(400, 'The route heights must be one number (or null) per route point.');
  return heights;
}

// Builds the elevation chart's profile from heights that belong to the
// route's points. Without usable heights the trail gets none for now, and the
// route-enrich job asks OpenRouteService's elevation service instead.
function setProfile(trail, heights, source) {
  const profile = heights ? profileForTrack(trail.track, heights, source) : null;
  trail.elevationProfile = profile ? { ...profile, routeVersion: trail.routeVersion } : undefined;
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

// Finds the YouTube channel a trail's video is on, if it isn't known yet
// (trails saved before, or when YouTube couldn't be reached), and saves it.
async function fillChannel(trail) {
  if (trail.channel?.name) return;
  const channel = await fetchChannel(trail.youtubeId);
  if (!channel) return;
  trail.channel = channel;
  await Trail.updateOne({ _id: trail._id }, { $set: { channel } });
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

// A drawn route is an estimate: this many points is plenty for its shape, and
// keeps a long trip quick to send, and smooth to follow on a phone.
export const MAX_DRAWN_POINTS = 10000;

// Draws the route through the key points in video order, with estimated times
// so the map can follow the video. Returns a notice if it fell back to straight lines.
export async function drawRouteFromPoints(trail) {
  const points = [...trail.points].sort((a, b) => a.time - b.time);
  if (points.length < 2) {
    if (trail.track.length > 0) trail.routeVersion += 1;
    trail.set({ track: [], trackTimes: [], elevationProfile: undefined });
    return null;
  }
  const previousTrack = JSON.stringify(trail.track);
  const { segments, notice } = await routeSegments(points, trail.routeStyle);
  const { track, trackTimes, trackElevations } = timedTrack(points, thinSegments(segments, MAX_DRAWN_POINTS), MAX_DRAWN_POINTS);
  // The times are video times already, so the video and route need no lining up.
  trail.set({ track, trackTimes, routeSource: 'keypoints', videoStartsAt: 0, recordedAt: undefined });
  const version = trail.routeVersion;
  bumpVersionIfReshaped(trail, previousTrack);
  // Roads and footpaths come with heights from OpenRouteService; straight lines don't.
  if (trail.routeVersion !== version) setProfile(trail, trackElevations.some((h) => h !== null) ? trackElevations : null, 'ors');
  return notice;
}

// A route drawn from key points is redrawn whenever the key points change.
const redrawIfDrawn = (trail) => (trail.routeSource === 'keypoints' ? drawRouteFromPoints(trail) : null);

// The newest trails, a page at a time: ?before=<the last trail's _id> gives
// the next page, ?limit= its size (24 by default, at most 100).
export async function listTrails(req, res) {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || LIST_PAGE, 1), LIST_MAX);
  const before = String(req.query.before ?? '');
  const trails = await Trail.find(mongoose.isValidObjectId(before) ? { _id: { $lt: before } } : {})
    .sort({ _id: -1 })
    .limit(limit)
    .select(CARD_FIELDS)
    .populate('owner', OWNER_FIELDS)
    .lean();
  res.json(trails);
  // Older trails without their channel: look a few up for next time.
  for (const trail of trails.filter((t) => !t.channel?.name).slice(0, 5)) fillChannel(trail).catch(() => {});
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
  if (fields.track?.length) setProfile(trail, elevationsFrom(req.body, fields.track), 'gpx');
  const info = await fetchVideoInfo(trail.youtubeId);
  trail.channel = info?.channel ?? undefined;
  if (!trail.videoTitle && info?.title) trail.videoTitle = info.title;
  await saveTrail(trail, 0);
  await sendTrail(res, trail, { status: 201 });
}

// A YouTube video's title and channel, for the form that adds a trail: the
// title usually says where the trip starts and ends.
export async function videoInfo(req, res) {
  const youtubeId = parseYouTubeId(String(req.query.url ?? ''));
  if (!youtubeId) throw httpError(400, "That doesn't look like a YouTube video link.");
  const info = await fetchVideoInfo(youtubeId);
  if (!info) throw httpError(404, "YouTube didn't say what this video is called (it may be private, or YouTube can't be reached). Type the title instead.");
  res.json({ youtubeId, title: info.title, channel: info.channel });
}

export async function getTrail(req, res) {
  await trailReads.run(async () => {
    const trail = await Trail.findById(req.params.id).populate('owner', OWNER_FIELDS).lean();
    if (!trail) throw httpError(404, 'Trail not found.');
    await fillChannel(trail);
    res.json({ ...withDefaults(trail), routeNotice: null });
  });
}

export async function updateTrail(req, res) {
  const trail = await findOwnTrail(req);
  const version = trail.routeVersion;
  const previousTrack = JSON.stringify(trail.track);
  const fields = pick(req.body, TRAIL_FIELDS);
  trail.set(fields);
  if (fields.track?.length) trail.routeSource = 'gpx';
  if (fields.track !== undefined) {
    bumpVersionIfReshaped(trail, previousTrack);
    const heights = elevationsFrom(req.body, fields.track);
    if (trail.routeVersion !== version || heights) setProfile(trail, heights, 'gpx');
  }
  if (req.body?.youtubeUrl !== undefined) {
    const youtubeId = youtubeIdFrom(req.body);
    if (youtubeId !== trail.youtubeId) {
      trail.youtubeId = youtubeId;
      const info = await fetchVideoInfo(youtubeId);
      trail.channel = info?.channel ?? undefined;
      if (fields.videoTitle === undefined) trail.videoTitle = info?.title ?? '';
    }
  }
  await saveTrail(trail, version);
  await sendTrail(res, trail);
}

export async function deleteTrail(req, res) {
  const trail = await findOwnTrail(req);
  await trail.deleteOne();
  // Work waiting for this trail's route, and what it found, are no longer needed.
  await Job.updateMany({ type: 'route-enrich', trail: trail._id, state: 'queued' }, { state: 'cancelled' });
  await RouteServices.deleteMany({ trail: trail._id });
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
