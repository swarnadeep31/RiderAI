// Starting an AI analysis of a trail's video, and accepting its reviewed places.
import { aiConfig } from '../config.js';
import { Job } from '../models/Job.js';
import { PROMPT_VERSION } from '../services/gemini.js';
import { httpError } from '../utils/httpError.js';
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
    videoTitle: job.videoTitle ?? '',
    model: job.model,
    highDetail: job.highDetail,
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

export async function startAiRoute(req, res) {
  const config = aiConfig();
  if (!config.apiKey) throw httpError(503, "AI route building isn't set up on this server yet (GEMINI_API_KEY in server/.env).");
  const trail = await findOwnTrail(req);
  if (hasRecordedRoute(trail)) throw httpError(409, "This trail already has the rider's GPS route.");

  const durationSec = Number(req.body?.durationSec);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw httpError(400, "The video's length is missing. Wait for the video to load, then try again.");
  }
  if (durationSec > config.maxVideoMinutes * 60) {
    throw httpError(400, `Videos longer than ${config.maxVideoMinutes / 60} hours aren't supported yet.`);
  }
  if (await Job.exists({ type: 'ai-route', trail: trail._id, state: { $in: ['queued', 'running'] } })) {
    throw httpError(409, 'An analysis is already running for this trail.');
  }

  const highDetail = typeof req.body?.highDetail === 'boolean' ? req.body.highDetail : config.highDetail;
  const settings = { type: 'ai-route', youtubeId: trail.youtubeId, model: config.model, promptVersion: PROMPT_VERSION, highDetail };

  // Someone already analysed this video with the same settings: reuse it, free.
  if (!req.body?.fresh) {
    const previous = await Job.findOne({ ...settings, state: { $in: ['needs_review', 'accepted'] } }).sort({ createdAt: -1 });
    if (previous?.result?.candidates) {
      const job = await Job.create({
        ...settings,
        trail: trail._id,
        user: req.user._id,
        durationSec,
        videoTitle: previous.videoTitle,
        state: 'needs_review',
        stage: 'review',
        result: previous.result,
        reusedFrom: previous._id,
      });
      return res.status(201).json(jobView(job));
    }
  }

  // Limits that stop a runaway bill.
  const today = await Job.countDocuments({ type: 'ai-route', user: req.user._id, createdAt: { $gte: startOfTodayUtc() }, reusedFrom: null });
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

  const job = await Job.create({ ...settings, trail: trail._id, user: req.user._id, durationSec });
  res.status(202).json(jobView(job));
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
