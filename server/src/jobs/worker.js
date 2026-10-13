// Runs background jobs inside the API process, one at a time (it respects the
// free tiers and the place search's one-request-per-second rule). Jobs live
// in MongoDB, so nothing is lost when the server restarts or a free host sleeps.
import { randomUUID } from 'node:crypto';
import { Job } from '../models/Job.js';
import { defaultServices, JobCancelled, removeOldUploads, runJob } from '../aiRoute/pipeline.js';
import { defaultEnrichServices, runEnrichJob } from '../routeExtras/enrich.js';

const LEASE_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const workerId = randomUUID();

// What runs each type of job. `services` replaces outside services in tests.
const RUNNERS = {
  'ai-route': (job, services) => runJob(job, { ...defaultServices, ...services }),
  'route-enrich': (job, services) => runEnrichJob(job, { ...defaultEnrichServices, ...services }),
};

// Claims the oldest waiting job (or one whose worker stopped) and runs it.
export async function processNextJob(services = {}) {
  const now = new Date();
  const job = await Job.findOneAndUpdate(
    { state: { $in: ['queued', 'running'] }, lockedUntil: { $lt: now } },
    { $set: { state: 'running', lockedUntil: new Date(now.getTime() + LEASE_MS), workerId }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
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
    if (!(err instanceof JobCancelled)) {
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
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      while (await processNextJob()) {
        // Keep going while there's work.
      }
    } catch (err) {
      console.error('Job worker error:', err);
    } finally {
      busy = false;
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
