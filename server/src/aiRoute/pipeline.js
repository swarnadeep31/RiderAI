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

export class JobCancelled extends Error {}

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
    return await extractPlacesWithFallback({ file: uploaded, model: job.model, highDetail: job.highDetail, noAudio, soundOnly });
  } finally {
    if (uploaded) await deleteUploadedVideo(uploaded.name);
    await rm(dir, { recursive: true, force: true });
  }
}

// The outside services, replaceable in tests.
// extract switches to a backup model when the job's model has reached its limit (see GEMINI_FALLBACK_MODELS).
export const defaultServices = { extract: extractPlacesWithFallback, extractFromUpload, checkVideo, geocode: geocodeCandidates };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopIfCancelled(job) {
  if (await Job.exists({ _id: job._id, state: 'cancelled' })) throw new JobCancelled();
}

async function extractWithRetries(job, clip, services) {
  const { retryDelays } = aiConfig();
  for (let attempt = 0; ; attempt++) {
    try {
      if (job.source === 'upload') return await services.extractFromUpload({ job, clip });
      return await services.extract({
        youtubeId: job.youtubeId,
        // One clip covering the whole video is sent without offsets.
        clipStart: clip.start,
        clipEnd: clip.start === 0 && clip.end >= job.durationSec ? null : clip.end,
        model: job.model,
        highDetail: job.highDetail,
      });
    } catch (err) {
      clip.attempts = attempt + 1;
      // Gemini says whether trying again might help; other errors (a network hiccup) get another go.
      const retryable = err.retryable ?? true;
      if (!retryable || attempt >= retryDelays.length) throw err;
      await sleep(retryDelays[attempt] * 1000);
      await stopIfCancelled(job);
    }
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
// (if the server stops, it stays for the analysis to carry on).
export async function runJob(job, services = defaultServices) {
  try {
    return await runStages(job, services);
  } finally {
    if (job.source === 'upload' && job.uploadPath) await rm(job.uploadPath, { force: true });
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
      const result = await extractWithRetries(job, clip, services);
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
    const { candidates, hiddenRanges } = mergeClips(cleaned, { minConfidence: config.minConfidence });
    job.result = { candidates, hiddenRanges };
    job.stage = 'geocode';
    job.progress = { done: 0, total: candidates.length };
    await job.save();
  }

  if (job.stage === 'geocode') {
    const candidates = job.result.candidates;
    await services.geocode(candidates, {
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
