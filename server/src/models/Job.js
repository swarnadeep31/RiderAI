import mongoose from 'mongoose';

// Background work on a trail, of two kinds:
// - 'ai-route': one AI analysis of a trail's video.
// - 'route-enrich': heights, services along the route and trip stats for one
//   version of a trail's route.
// Stages run in the background and each saves its result before the next
// starts, so a restart never repeats a paid (or rate-limited) call.
export const JOB_TYPES = ['ai-route', 'route-enrich'];
export const JOB_STATES = ['queued', 'running', 'needs_review', 'accepted', 'done', 'failed', 'cancelled'];
export const JOB_STAGES = ['check', 'extract', 'clean', 'geocode', 'review', 'elevation', 'services', 'stats'];

const clipSchema = new mongoose.Schema(
  {
    start: Number,
    end: Number,
    status: { type: String, enum: ['pending', 'done'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    raw: String, // Gemini's answer, kept for checking and re-cleaning without paying again
    answer: mongoose.Schema.Types.Mixed,
    usage: mongoose.Schema.Types.Mixed,
  },
  { _id: false },
);

const usageSchema = new mongoose.Schema(
  { inputTokens: Number, outputTokens: Number, thinkingTokens: Number, costUsd: Number },
  { _id: false },
);

const isAiRoute = function () {
  return this.type === 'ai-route';
};

const jobSchema = new mongoose.Schema(
  {
    type: { type: String, enum: JOB_TYPES, default: 'ai-route' },
    trail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    youtubeId: { type: String, required: isAiRoute },
    durationSec: { type: Number, required: isAiRoute },
    // route-enrich: the version of the route this job works on, and whether the owner asked for it.
    routeVersion: Number,
    manual: Boolean,
    model: String,
    promptVersion: String,
    highDetail: { type: Boolean, default: false },
    videoTitle: String,

    state: { type: String, enum: JOB_STATES, default: 'queued' },
    stage: { type: String, enum: JOB_STAGES, default: 'check' },
    progress: { done: { type: Number, default: 0 }, total: { type: Number, default: 0 } },
    clips: { type: [clipSchema], default: [] },
    // route-enrich: Overpass answers, one per piece of the route, saved as they come.
    chunks: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    // What the review screen shows.
    result: { candidates: mongoose.Schema.Types.Mixed, hiddenRanges: mongoose.Schema.Types.Mixed },
    usage: { type: usageSchema, default: () => ({ inputTokens: 0, outputTokens: 0, thinkingTokens: 0, costUsd: 0 }) },
    // Set when this job reused another job's result for the same video (no cost).
    reusedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    error: String,
    attempts: { type: Number, default: 0 },

    // A worker "leases" the job while running it. If the server stops, the
    // lease runs out and the job continues from its last saved stage.
    lockedUntil: { type: Date, default: () => new Date(0) },
    workerId: String,
  },
  { timestamps: true },
);

jobSchema.index({ state: 1, lockedUntil: 1 });
jobSchema.index({ trail: 1, createdAt: -1 });
jobSchema.index({ youtubeId: 1, model: 1, promptVersion: 1, highDetail: 1 });
jobSchema.index({ type: 1, trail: 1, routeVersion: 1 });

export const Job = mongoose.model('Job', jobSchema);
