// Runs an AI route job stage by stage: check the video, ask Gemini about each
// clip, clean the answers, find the places on the map, then wait for review.
// Every stage saves its result first, so a restart picks up where it stopped
// and a clip Gemini already answered is never paid for twice.
import { aiConfig } from '../config.js';
import { Job } from '../models/Job.js';
import { extractPlaces, GeminiError } from '../services/gemini.js';
import { checkVideo } from '../services/youtubeInfo.js';
import { addUsage, summarizeUsage } from './cost.js';
import { cleanClip, mergeClips, planClips } from './clean.js';
import { geocodeCandidates } from './geocode.js';

export class JobCancelled extends Error {}

// The outside services, replaceable in tests.
export const defaultServices = { extract: extractPlaces, checkVideo, geocode: geocodeCandidates };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopIfCancelled(job) {
  if (await Job.exists({ _id: job._id, state: 'cancelled' })) throw new JobCancelled();
}

async function extractWithRetries(job, clip, services) {
  const { retryDelays } = aiConfig();
  for (let attempt = 0; ; attempt++) {
    try {
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
      const retryable = !(err instanceof GeminiError) || err.retryable;
      if (!retryable || attempt >= retryDelays.length) throw err;
      await sleep(retryDelays[attempt] * 1000);
      await stopIfCancelled(job);
    }
  }
}

export async function runJob(job, services = defaultServices) {
  const config = aiConfig();

  if (job.stage === 'check') {
    const video = await services.checkVideo(job.youtubeId);
    if (!video.ok) throw new Error(video.reason);
    job.videoTitle = video.title;
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
      const usage = summarizeUsage(result.model ?? job.model, result.usage);
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
    const cleaned = job.clips.map((clip) => cleanClip(clip.answer, clip, job.durationSec));
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
