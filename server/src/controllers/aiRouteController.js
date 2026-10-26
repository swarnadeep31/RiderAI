// Starting an AI analysis of a trail's video, and accepting its reviewed places.
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tripKey, tripOf } from '../aiRoute/trip.js';
import { aiConfig } from '../config.js';
import { Job, MEDIA_MODES } from '../models/Job.js';
import { PROMPT_VERSION } from '../services/gemini.js';
import { probeVideo } from '../services/videoFile.js';
import { httpError } from '../utils/httpError.js';
import { formatClock } from '../utils/time.js';
import { drawRouteFromPoints, findOwnTrail, saveTrail, sendTrail } from './trailsController.js';

// What the browser sees of a job (not the raw Gemini answers).
export function jobView(job) {
  const showResult = ['needs_review', 'accepted'].includes(job.state);
  return {
    _id: job._id,
    trail: job.trail,
    state: job.state,
    stage: job.stage,
    progress: job.progress,
    error: job.error ?? null,
    // Waiting to try again: when, and why (e.g. "Gemini is busy...").
    retryAt: job.state === 'queued' ? (job.retryAt ?? null) : null,
    retryReason: job.state === 'queued' ? (job.retryReason ?? null) : null,
    videoTitle: job.videoTitle ?? '',
    // The start and end the places were pinned between, if the owner gave them.
    trip: job.trip?.start || job.trip?.end ? { start: job.trip.start ?? null, end: job.trip.end ?? null } : null,
    model: job.model,
    // The models that answered: a backup when the main one had reached its limit.
    modelsUsed: [...new Set((job.clips ?? []).map((clip) => clip.usage?.model).filter(Boolean))],
    highDetail: job.highDetail,
    source: job.source ?? 'youtube',
    mediaMode: job.mediaMode ?? 'full',
    reused: Boolean(job.reusedFrom),
    costUsd: job.usage?.costUsd ?? 0,
    createdAt: job.createdAt,
    result: showResult ? job.result : null,
  };
}

const hasRecordedRoute = (trail) => trail.track.length > 0 && trail.routeSource !== 'keypoints';
const startOfTodayUtc = () => new Date(new Date().setUTCHours(0, 0, 0, 0));
const startOfMonthUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

// The checks before any analysis: the server can do it, the trail is the
// user's and has no GPS route, and nothing is running for it already.
async function trailReadyForAi(req, config) {
  if (!config.apiKey) throw httpError(503, "AI route building isn't set up on this server yet (GEMINI_API_KEY in server/.env).");
  const trail = await findOwnTrail(req);
  if (hasRecordedRoute(trail)) throw httpError(409, "This trail already has the rider's GPS route.");
  if (await Job.exists({ type: 'ai-route', trail: trail._id, state: { $in: ['queued', 'running'] } })) {
    throw httpError(409, 'An analysis is already running for this trail.');
  }
  return trail;
}

function checkDuration(value, config) {
  const durationSec = Number(value);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw httpError(400, "The video's length is missing. Wait for the video to load, then try again.");
  }
  if (durationSec > config.maxVideoMinutes * 60) {
    throw httpError(400, `Videos longer than ${config.maxVideoMinutes / 60} hours aren't supported yet.`);
  }
  return durationSec;
}

// Limits that stop a runaway bill.
async function checkLimits(user, config) {
  const today = await Job.countDocuments({ type: 'ai-route', user: user._id, createdAt: { $gte: startOfTodayUtc() }, reusedFrom: null });
  if (today >= config.jobsPerUserPerDay) {
    throw httpError(429, `You can run ${config.jobsPerUserPerDay} AI analyses a day. Please try again tomorrow.`);
  }
  const [month] = await Job.aggregate([
    { $match: { createdAt: { $gte: startOfMonthUtc() } } },
    { $group: { _id: null, spent: { $sum: '$usage.costUsd' } } },
  ]);
  if ((month?.spent ?? 0) >= config.monthlyBudgetUsd) {
    throw httpError(429, "This month's AI budget is used up. Please try again next month.");
  }
}

// An earlier analysis with the same settings, given again for free.
async function reuse(previous, { trail, user, durationSec }) {
  if (!previous?.result?.candidates) return null;
  const { type, source, mediaMode, youtubeId, fileHash, model, promptVersion, highDetail, videoTitle, trip, tripKey: key, result } = previous;
  return Job.create({
    trip,
    tripKey: key,
    type,
    source,
    mediaMode,
    youtubeId,
    fileHash,
    model,
    promptVersion,
    highDetail,
    videoTitle,
    result,
    trail: trail._id,
    user: user._id,
    durationSec,
    state: 'needs_review',
    stage: 'review',
    reusedFrom: previous._id,
  });
}

const highDetailFrom = (value, config) => (typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : config.highDetail);
const READY = { $in: ['needs_review', 'accepted'] };

export async function startAiRoute(req, res) {
  const config = aiConfig();
  const trail = await trailReadyForAi(req, config);
  const durationSec = checkDuration(req.body?.durationSec, config);
  const highDetail = highDetailFrom(req.body?.highDetail, config);
  // Where the trip starts and ends: the same video with other ends is another analysis.
  const trip = tripOf(trail);
  const settings = { type: 'ai-route', youtubeId: trail.youtubeId, model: config.model, promptVersion: PROMPT_VERSION, highDetail, tripKey: tripKey(trip) };

  // Someone already analysed this video with the same settings: reuse it, free.
  if (!req.body?.fresh) {
    const previous = await Job.findOne({ ...settings, source: { $ne: 'upload' }, state: READY }).sort({ createdAt: -1 });
    const reused = await reuse(previous, { trail, user: req.user, durationSec });
    if (reused) return res.status(201).json(jobView(reused));
  }

  await checkLimits(req.user, config);
  const job = await Job.create({ ...settings, trip, trail: trail._id, user: req.user._id, durationSec });
  res.status(202).json(jobView(job));
}

// Who is uploading a file right now (user ids). Uploaded files wait on this
// server's disk until their analysis ends, so each person uploads one at a
// time, and only so many wait at once.
const receiving = new Set();
// Room left on the disk after a file, for everything else the server writes.
const DISK_MARGIN_BYTES = 200 * 1048576;

const WAITING_UPLOAD = { type: 'ai-route', source: 'upload', state: { $in: ['queued', 'running'] } };

async function checkRoomForUpload(user, config, maxBytes, declaredBytes) {
  if (await Job.exists({ ...WAITING_UPLOAD, user: user._id })) {
    throw httpError(409, 'One of your uploaded videos is still with the AI. Wait for it to finish, then upload the next one.');
  }
  // (receiving counts this upload too.)
  if ((await Job.countDocuments(WAITING_UPLOAD)) + receiving.size > config.maxWaitingUploads) {
    throw httpError(503, 'Too many uploaded videos are waiting for the AI right now. Try again later, or use the YouTube link.');
  }
  const disk = await statfs(config.uploadDir).catch(() => null);
  if (disk && disk.bavail * disk.bsize < (declaredBytes || maxBytes) + DISK_MARGIN_BYTES) {
    throw httpError(503, "The server doesn't have room for this file right now. Try a smaller copy, or use the YouTube link.");
  }
}

// Saves the uploaded file (the request body) to `path`, stopping at
// `maxBytes`, and returns its size and fingerprint (SHA-256).
async function receiveFile(req, path, maxBytes) {
  const hash = createHash('sha256');
  let bytes = 0;
  const count = new Transform({
    transform(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > maxBytes) return done(httpError(413, `The file is too big: the most this server takes is ${Math.round(maxBytes / 1048576)} MB.`));
      hash.update(chunk);
      done(null, chunk);
    },
  });
  await pipeline(req, count, createWriteStream(path));
  return { bytes, fileHash: hash.digest('hex') };
}

// Starts an analysis from a video file the owner uploads: the same video as
// on YouTube, from their own computer. Unlike a YouTube link, TrailCast can
// then choose what Gemini gets: picture and sound ('full'), the picture only,
// or only the sound (what's said: the cheapest, but no sign boards). The file
// waits on the server until the analysis ends, then it's deleted.
// Query: mode, durationSec (the YouTube video's length, to check it's the
// same video), highDetail. The X-File-Name header: the file's name.
export async function uploadAiVideo(req, res) {
  const config = aiConfig();
  const userId = String(req.user._id);
  if (receiving.has(userId)) throw httpError(409, "You're already uploading a video. Wait for it to finish, then upload the next one.");
  receiving.add(userId);
  try {
    await receiveUpload(req, res, config);
  } finally {
    receiving.delete(userId);
  }
}

// The upload itself, once it's the only one of this user's.
async function receiveUpload(req, res, config) {
  const trail = await trailReadyForAi(req, config);
  const mediaMode = req.query.mode ?? 'full';
  if (!MEDIA_MODES.includes(mediaMode)) throw httpError(400, `The mode must be one of: ${MEDIA_MODES.join(', ')}.`);
  const youtubeSec = checkDuration(req.query.durationSec, config);
  const maxBytes = config.maxUploadMb * 1048576;
  const declaredBytes = Number(req.headers['content-length']) || 0;
  if (declaredBytes > maxBytes) {
    throw httpError(413, `The file is too big: the most this server takes is ${config.maxUploadMb} MB.`);
  }
  await checkLimits(req.user, config);

  await mkdir(config.uploadDir, { recursive: true });
  await checkRoomForUpload(req.user, config, maxBytes, declaredBytes);
  const uploadPath = join(config.uploadDir, `${randomUUID()}.video`);
  let keep = false;
  try {
    const { bytes, fileHash } = await receiveFile(req, uploadPath, maxBytes);
    if (bytes === 0) throw httpError(400, 'No file arrived. Choose the video file and try again.');
    let info;
    try {
      info = await probeVideo(uploadPath);
    } catch (err) {
      if (/not installed/.test(err.message)) throw httpError(503, "This server can't read video files yet (FFmpeg isn't installed).");
      throw httpError(400, "That doesn't look like a video file. Try an .mp4, .mov or .mkv file.");
    }
    if (mediaMode !== 'picture' && !info.hasAudio) {
      throw httpError(400, 'This file has no sound. Choose "Picture only" to use it.');
    }
    // The places' times must line up with the YouTube video, so it has to be the same edit.
    const tolerance = Math.max(5, youtubeSec * 0.02);
    if (Math.abs(info.durationSec - youtubeSec) > tolerance) {
      throw httpError(
        400,
        `This file is ${formatClock(info.durationSec)} long, but the YouTube video is ${formatClock(youtubeSec)}. ` +
          'Upload the same video you put on YouTube, so the places line up with it.',
      );
    }
    const durationSec = checkDuration(info.durationSec, config);
    const highDetail = highDetailFrom(req.query.highDetail, config);
    let videoTitle = 'Uploaded video';
    try {
      videoTitle = decodeURIComponent(req.get('x-file-name') ?? '').slice(0, 200) || videoTitle;
    } catch {
      // A name that isn't properly encoded: keep the plain title.
    }
    const trip = tripOf(trail);
    const settings = {
      type: 'ai-route',
      source: 'upload',
      mediaMode,
      youtubeId: trail.youtubeId,
      fileHash,
      model: config.model,
      promptVersion: PROMPT_VERSION,
      highDetail,
      tripKey: tripKey(trip),
    };

    // The same file was analysed the same way before: reuse it, free.
    const previous = await Job.findOne({ ...settings, state: READY }).sort({ createdAt: -1 });
    const reused = await reuse(previous, { trail, user: req.user, durationSec });
    if (reused) {
      await rm(uploadPath, { force: true });
      return res.status(201).json(jobView(reused));
    }

    const job = await Job.create({ ...settings, trip, uploadPath, videoTitle, trail: trail._id, user: req.user._id, durationSec });
    keep = true;
    res.status(202).json(jobView(job));
  } finally {
    if (!keep) await rm(uploadPath, { force: true });
  }
}

// The latest analysis of this trail, so the page can pick up where it was.
export async function latestAiRoute(req, res) {
  const trail = await findOwnTrail(req);
  const job = await Job.findOne({ type: 'ai-route', trail: trail._id }).sort({ createdAt: -1 });
  res.json(job ? jobView(job) : null);
}

function acceptedPlace(place) {
  if (typeof place !== 'object' || place === null) throw httpError(400, 'Each place must be an object.');
  const { name, time, stayUntil, stopKind, lat, lng, note, confidence, evidence, quote } = place;
  return {
    name,
    time,
    stayUntil: stayUntil ?? undefined,
    stopKind: stopKind ?? undefined,
    lat,
    lng,
    note: note ?? '',
    origin: 'ai',
    confidence,
    evidence,
    quote: quote ? String(quote).slice(0, 200) : undefined,
  };
}

// The owner reviewed the AI's places: they become key points, and the route is drawn.
export async function acceptAiRoute(req, res) {
  const trail = await findOwnTrail(req);
  const version = trail.routeVersion;
  if (hasRecordedRoute(trail)) throw httpError(409, "This trail already has the rider's GPS route.");
  const job = await Job.findOne({ _id: req.body?.jobId, type: 'ai-route', trail: trail._id, user: req.user._id }).catch(() => null);
  if (!job) throw httpError(404, 'Analysis not found.');
  if (!['needs_review', 'accepted'].includes(job.state)) throw httpError(409, "This analysis isn't ready to accept.");

  const places = req.body?.places;
  if (!Array.isArray(places) || places.length < 2) throw httpError(400, 'Keep at least two places to draw a route.');

  // Replace the earlier AI places, keep the ones people added by hand.
  trail.points = [...trail.points.filter((p) => p.origin !== 'ai'), ...places.map(acceptedPlace)];
  trail.points.sort((a, b) => a.time - b.time);
  trail.hiddenRanges = Array.isArray(req.body?.hiddenRanges) ? req.body.hiddenRanges : [];
  if (trail.routeSource !== 'keypoints') trail.routeStyle = ['hike', 'climb'].includes(trail.activity) ? 'paths' : 'roads';
  await trail.validate();

  const routeNotice = await drawRouteFromPoints(trail);
  trail.ai = { job: job._id, model: job.model, promptVersion: job.promptVersion, analyzedAt: new Date() };
  await saveTrail(trail, version);
  job.state = 'accepted';
  await job.save();
  await sendTrail(res, trail, { routeNotice });
}
