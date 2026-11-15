// Runs background jobs inside the API process, in two lines: AI analyses, and
// the route work (heights, fuel stops, stats), so a long AI analysis never
// holds up the quick route work for everyone else's new routes. The AI line
// runs a few analyses at once (AI_WORKERS): they spend most of their time
// waiting for Gemini, so this costs little memory. The route line runs one
// at a time, as Overpass asks. Each outside service keeps its own pace (the
// place search one request a second, Overpass 1.5 s apart). Jobs live in
// MongoDB, so nothing is lost when the server restarts or a free host sleeps.
//
// Turns are fair: a user with a job running waits while others have jobs
// waiting, so one person's analyses can't hold up everyone else's. And only
// one uploaded video file is worked on at a time (FFmpeg needs the memory).
import { randomUUID } from 'node:crypto';
import { aiConfig } from '../config.js';
import { Job } from '../models/Job.js';
import { defaultServices, JobCancelled, RetryLater, removeOldUploads, runJob } from '../aiRoute/pipeline.js';
import { defaultEnrichServices, runEnrichJob } from '../routeExtras/enrich.js';

const LEASE_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const workerId = randomUUID();

// The two lines of work, by job type, and how many jobs each runs at once.
export const LANES = [
  { types: ['ai-route'], workers: () => aiConfig().workers },
  { types: ['route-enrich'], workers: () => 1 },
];

// What runs each type of job. `services` replaces outside services in tests.
const RUNNERS = {
  'ai-route': (job, services) => runJob(job, { ...defaultServices, ...services }),
  'route-enrich': (job, services) => runEnrichJob(job, { ...defaultEnrichServices, ...services }),
};

// Claims a job and runs it: the oldest waiting one (or one whose worker
// stopped) of a user who has nothing running in this line; if there's none,
// the oldest of anyone's. `types`: only jobs of these types (one line of
// work); all of them by default.
export async function processNextJob(services = {}, { types } = {}) {
  const now = new Date();
  const ofType = types ? { type: { $in: types } } : {};
  const working = { state: 'running', lockedUntil: { $gte: now }, ...ofType };
  const [busyUsers, uploading] = await Promise.all([
    Job.distinct('user', working),
    Job.exists({ ...working, source: 'upload' }),
  ]);
  const claimable = {
    state: { $in: ['queued', 'running'] },
    lockedUntil: { $lt: now },
    ...ofType,
    ...(uploading && { source: { $ne: 'upload' } }),
  };
  const claim = (filter) =>
    Job.findOneAndUpdate(
      filter,
      {
        $set: { state: 'running', lockedUntil: new Date(now.getTime() + LEASE_MS), workerId },
        $unset: { retryAt: 1, retryReason: 1 },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    );
  const job = (busyUsers.length && (await claim({ ...claimable, user: { $nin: busyUsers } }))) || (await claim(claimable));
  if (!job) return null;

  if (job.attempts > MAX_ATTEMPTS) {
    await Job.updateOne({ _id: job._id }, { state: 'failed', error: 'This analysis kept stopping. Please start it again.' });
    return job;
  }

  const heartbeat = setInterval(() => {
    Job.updateOne({ _id: job._id, workerId }, { lockedUntil: new Date(Date.now() + LEASE_MS) }).catch(() => {});
  }, HEARTBEAT_MS);
  try {
    await RUNNERS[job.type](job, services);
  } catch (err) {
    if (err instanceof RetryLater) {
      // Back in the queue until it may work. Waiting isn't a stop, so it
      // doesn't count towards MAX_ATTEMPTS.
      await Job.updateOne(
        { _id: job._id, state: { $ne: 'cancelled' } },
        { $set: { state: 'queued', lockedUntil: err.at, retryAt: err.at, retryReason: err.message }, $inc: { attempts: -1 } },
      );
    } else if (!(err instanceof JobCancelled)) {
      // The clips already answered stay saved: nothing paid for is lost.
      await Job.updateOne(
        { _id: job._id, state: { $ne: 'cancelled' } },
        { state: 'failed', error: err.message || 'The analysis failed.', lockedUntil: new Date(0) },
      );
    }
  } finally {
    clearInterval(heartbeat);
  }
  return job;
}

export function startWorker({ intervalMs = 2000 } = {}) {
  removeOldUploads().catch((err) => console.error('Could not tidy old uploads:', err.message));
  const timers = LANES.flatMap(({ types, workers }) => Array.from({ length: Math.max(1, workers()) }, () => types)).map((types) => {
    let busy = false;
    return setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        while (await processNextJob({}, { types })) {
          // Keep going while there's work.
        }
      } catch (err) {
        console.error('Job worker error:', err);
      } finally {
        busy = false;
      }
    }, intervalMs);
  });
  return () => timers.forEach(clearInterval);
}
