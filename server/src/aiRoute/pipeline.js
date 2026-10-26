// Runs an AI route job stage by stage: check the video, ask Gemini about each
// clip, clean the answers, find the places on the map, then wait for review.
// Every stage saves its result first, so a restart picks up where it stopped
// and a clip Gemini already answered is never paid for twice.
import { access, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiConfig } from '../config.js';
import { Job } from '../models/Job.js';
import { deleteUploadedVideo, extractPlacesWithFallback, uploadVideo } from '../services/gemini.js';
import { extractSound, prepareVideo } from '../services/videoFile.js';
import { checkVideo } from '../services/youtubeInfo.js';
import { addUsage, summarizeUsage } from './cost.js';
import { cleanClip, mergeClips, planClips } from './clean.js';
import { geocodeCandidates } from './geocode.js';
import { pinTripEnds, tripArea } from './trip.js';

export class JobCancelled extends Error {}

// A try that failed but may work later (Gemini busy, a limit reached): the job
// goes back in the queue until `at`, and the worker gets on with other work
// meanwhile instead of waiting with it.
export class RetryLater extends Error {
  constructor(at, message) {
    super(message);
    this.at = at;
  }
}

// One clip of a video file the owner uploaded: cut out (and shrunk, or just
// its sound) with FFmpeg, uploaded to Gemini, asked about, then deleted from
// Gemini and from here. The clip starts at 0, so its times count from the
// clip's start.
async function extractFromUpload({ job, clip }) {
  const dir = await mkdtemp(join(tmpdir(), 'trailcast-clip-'));
  const soundOnly = job.mediaMode === 'sound';
  const noAudio = job.mediaMode === 'picture';
  const path = join(dir, soundOnly ? 'clip.m4a' : 'clip.mp4');
  const part = clip.start === 0 && clip.end >= job.durationSec ? {} : { start: clip.start, end: clip.end };
  let uploaded;
  try {
    try {
      if (soundOnly) await extractSound(job.uploadPath, path, part);
      else await prepareVideo(job.uploadPath, path, { ...part, noAudio, maxHeight: job.highDetail ? 720 : 480 });
    } catch (err) {
      err.retryable = false; // trying again won't fix a file FFmpeg can't read
      throw err;
    }
    uploaded = await uploadVideo(path, { mimeType: soundOnly ? 'audio/mp4' : 'video/mp4' });
    return await extractPlacesWithFallback({ file: uploaded, model: job.model, highDetail: job.highDetail, noAudio, soundOnly, trip: tripFor(job) });
  } finally {
    if (uploaded) await deleteUploadedVideo(uploaded.name);
    await rm(dir, { recursive: true, force: true });
  }
}

// The outside services, replaceable in tests.
// extract switches to a backup model when the job's model has reached its limit (see GEMINI_FALLBACK_MODELS).
export const defaultServices = { extract: extractPlacesWithFallback, extractFromUpload, checkVideo, geocode: geocodeCandidates };

// What the trail's owner said about the trip: { title, start, end } (see trip.js).
function tripFor(job) {
  return { title: job.trip?.title ?? '', start: job.trip?.start ?? null, end: job.trip?.end ?? null };
}

async function stopIfCancelled(job) {
  if (await Job.exists({ _id: job._id, state: 'cancelled' })) throw new JobCancelled();
}

// Asks Gemini about one clip, once. A failure that might pass is tried again
// later (RetryLater), after each of AI_RETRY_DELAYS in turn; after the last,
// the job fails with Gemini's reason. The tries are saved with the clip, so
// they add up across the job's turns in the queue.
async function extractClip(job, clip, services) {
  try {
    if (job.source === 'upload') return await services.extractFromUpload({ job, clip });
    return await services.extract({
      youtubeId: job.youtubeId,
      // One clip covering the whole video is sent without offsets.
      clipStart: clip.start,
      clipEnd: clip.start === 0 && clip.end >= job.durationSec ? null : clip.end,
      model: job.model,
      highDetail: job.highDetail,
      trip: tripFor(job),
    });
  } catch (err) {
    const { retryDelays } = aiConfig();
    clip.attempts = (clip.attempts ?? 0) + 1;
    job.markModified('clips');
    await job.save();
    // Gemini says whether trying again might help; other errors (a network hiccup) get another go.
    const retryable = err.retryable ?? true;
    if (!retryable || clip.attempts > retryDelays.length) throw err;
    // When every model is resting, there's no point trying before the first is back.
    const waitMs = Math.max(retryDelays[clip.attempts - 1] * 1000, (err.retryAt?.getTime() ?? 0) - Date.now());
    throw new RetryLater(new Date(Date.now() + waitMs), err.message);
  }
}

// Deletes uploaded video files left behind for over two days (an analysis
// that gave up after the server kept stopping). Run when the worker starts.
export async function removeOldUploads(dir = aiConfig().uploadDir, maxAgeMs = 2 * 24 * 60 * 60 * 1000) {
  const names = await readdir(dir).catch(() => []);
  for (const name of names) {
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info && Date.now() - info.mtimeMs > maxAgeMs) await rm(path, { force: true });
  }
}

// An uploaded video file is deleted when its analysis ends, however it ends
// (if the server stops, or the analysis waits to try again, it stays for the
// analysis to carry on).
export async function runJob(job, services = defaultServices) {
  let waiting = false;
  try {
    return await runStages(job, services);
  } catch (err) {
    waiting = err instanceof RetryLater;
    throw err;
  } finally {
    if (!waiting && job.source === 'upload' && job.uploadPath) await rm(job.uploadPath, { force: true });
  }
}

async function runStages(job, services) {
  const config = aiConfig();

  if (job.stage === 'check') {
    if (job.source === 'upload') {
      await access(job.uploadPath).catch(() => {
        throw new Error('The uploaded video is no longer on the server (it was restarted). Please upload it again.');
      });
    } else {
      const video = await services.checkVideo(job.youtubeId);
      if (!video.ok) throw new Error(video.reason);
      job.videoTitle = video.title;
      // The owner didn't give the title: YouTube's tells Gemini where the trip goes.
      if (!job.trip?.title && video.title) job.set('trip.title', video.title);
    }
    job.clips = planClips(job.durationSec, config.clipMinutes).map((c) => ({ ...c, status: 'pending' }));
    job.stage = 'extract';
    job.progress = { done: 0, total: job.clips.length };
    await job.save();
  }

  if (job.stage === 'extract') {
    for (const clip of job.clips) {
      if (clip.status === 'done') continue;
      await stopIfCancelled(job);
      const result = await extractClip(job, clip, services);
      // Priced (and remembered) by the model that actually answered, which may be a backup.
      const usage = { ...summarizeUsage(result.model ?? job.model, result.usage), model: result.model ?? job.model };
      Object.assign(clip, { status: 'done', raw: result.raw, answer: result.data, usage });
      job.usage = addUsage(job.usage, usage);
      job.progress = { done: job.clips.filter((c) => c.status === 'done').length, total: job.clips.length };
      job.markModified('clips');
      await job.save();
    }
    job.stage = 'clean';
    await job.save();
  }

  if (job.stage === 'clean') {
    // Clips cut from an uploaded file start at 0, so their times count from the clip's start.
    const cleaned = job.clips.map((clip) => cleanClip(clip.answer, clip, job.durationSec, { relative: job.source === 'upload' }));
    const merged = mergeClips(cleaned, { minConfidence: config.minConfidence });
    // The start and end the owner gave are pinned on, with the intro before the start.
    const { candidates, hiddenRanges } = pinTripEnds(merged, tripFor(job), job.durationSec);
    job.result = { candidates, hiddenRanges };
    job.stage = 'geocode';
    job.progress = { done: 0, total: candidates.length };
    await job.save();
  }

  if (job.stage === 'geocode') {
    const candidates = job.result.candidates;
    const trip = tripFor(job);
    await services.geocode(candidates, {
      start: trip.start,
      area: tripArea(trip),
      onProgress: async (done, total) => {
        job.progress = { done, total };
        if (done % 5 === 0 || done === total) {
          await stopIfCancelled(job);
          await job.save();
        }
      },
    });
    job.result = { ...job.result, candidates };
    job.markModified('result');
    job.stage = 'review';
  }

  // Don't overwrite a cancel that came in while the last stage ran.
  await stopIfCancelled(job);
  job.state = 'needs_review';
  job.lockedUntil = new Date(0);
  await job.save();
  return job;
}
