// Runs background jobs inside the API process, one at a time (it respects the
// free tiers and the place search's one-request-per-second rule). Jobs live
// in MongoDB, so nothing is lost when the server restarts or a free host sleeps.
import { randomUUID } from 'node:crypto';
import { Job } from '../models/Job.js';
import { defaultServices, JobCancelled, runJob } from '../aiRoute/pipeline.js';

const LEASE_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const workerId = randomUUID();

// Claims the oldest waiting job (or one whose worker stopped) and runs it.
export async function processNextJob(services = defaultServices) {
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
    await runJob(job, services);
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
