// What the AI has cost this calendar month (UTC), from the cost recorded with each analysis.
import { Job } from '../models/Job.js';

export const startOfMonthUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

export async function spentThisMonthUsd() {
  const [month] = await Job.aggregate([
    { $match: { createdAt: { $gte: startOfMonthUtc() } } },
    { $group: { _id: null, spent: { $sum: '$usage.costUsd' } } },
  ]);
  return month?.spent ?? 0;
}
