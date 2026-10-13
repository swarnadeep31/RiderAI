import { rm } from 'node:fs/promises';
import { Job } from '../models/Job.js';
import { httpError } from '../utils/httpError.js';
import { jobView } from './aiRouteController.js';

async function findOwnJob(req) {
  const job = await Job.findById(req.params.id);
  if (!job || !job.user.equals(req.user._id)) throw httpError(404, 'Analysis not found.');
  return job;
}

export async function getJob(req, res) {
  res.json(jobView(await findOwnJob(req)));
}

// Stops a waiting or running analysis. Clips Gemini already answered stay saved.
export async function cancelJob(req, res) {
  const job = await findOwnJob(req);
  if (!['queued', 'running'].includes(job.state)) throw httpError(409, 'This analysis has already finished.');
  const wasWaiting = job.state === 'queued';
  job.state = 'cancelled';
  job.lockedUntil = new Date(0);
  await job.save();
  // An uploaded file that was still waiting isn't needed (a running analysis deletes its own when it stops).
  if (wasWaiting && job.uploadPath) await rm(job.uploadPath, { force: true });
  res.json(jobView(job));
}
