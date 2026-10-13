import mongoose from 'mongoose';

export const ACTIVITIES = ['ride', 'hike', 'climb', 'cycle', 'other'];
// How a route drawn between key points travels: along roads, along footpaths, or in straight lines.
export const ROUTE_STYLES = ['roads', 'paths', 'straight'];
export const MAX_TRACK_POINTS = 20000;
export const MAX_KEY_POINTS = 200;

const isLatitude = (n) => Number.isFinite(n) && n >= -90 && n <= 90;
const isLongitude = (n) => Number.isFinite(n) && n >= -180 && n <= 180;

// Only real web links: a "javascript:" link here would run code for anyone who clicks it.
function isWebLink(value) {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// A place the creator marked in the video: "12:30 - Rohtang Pass viewpoint".
const keyPointSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Give the key point a name.'], trim: true, maxlength: 100 },
  note: { type: String, trim: true, maxlength: 1000, default: '' },
  time: { type: Number, required: [true, 'A key point needs a video time.'], min: 0 }, // seconds into the video
  lat: { type: Number, required: true, validate: { validator: isLatitude, message: 'Latitude must be between -90 and 90.' } },
  lng: { type: Number, required: true, validate: { validator: isLongitude, message: 'Longitude must be between -180 and 180.' } },
  // The marker waits here until this video time (a tea break, sightseeing...).
  stayUntil: {
    type: Number,
    validate: {
      validator(value) {
        return value === null || value === undefined || value >= this.time;
      },
      message: 'A stop must end after it starts.',
    },
  },
  // Added by a person, or suggested by the AI and accepted in review.
  origin: { type: String, enum: ['manual', 'ai'], default: 'manual' },
  // For AI places: how sure the AI was, and what it relied on.
  confidence: { type: Number, min: 0, max: 1 },
  evidence: { type: String, enum: ['sign', 'milestone', 'speech', 'landmark'] },
  quote: { type: String, trim: true, maxlength: 200 },
});

// Parts of the video that don't show the journey (intro, recap, drone montage):
// no marker is shown then.
export const HIDDEN_REASONS = ['intro', 'recap', 'montage', 'flashback', 'off_route'];
const hiddenRangeSchema = new mongoose.Schema(
  {
    start: { type: Number, required: true, min: 0 },
    end: {
      type: Number,
      required: true,
      validate: {
        validator(value) {
          return value > this.start;
        },
        message: 'A hidden part must end after it starts.',
      },
    },
    reason: { type: String, enum: HIDDEN_REASONS, default: 'off_route' },
  },
  { _id: false },
);

// Heights along the route for the elevation chart: d[i] metres from the start
// (every 10 m), e[i] the height there in metres. At most 1,000 samples.
// summary: worked out from all the heights, not just these samples.
export const PROFILE_SOURCES = ['gpx', 'ors', 'dem'];
const elevationProfileSchema = new mongoose.Schema(
  {
    d: [Number],
    e: [Number],
    // gpx: the recording itself; ors: OpenRouteService with a drawn route; dem: OpenRouteService's elevation service.
    source: { type: String, enum: PROFILE_SOURCES },
    routeVersion: Number,
    summary: { highestM: Number, highestAlongM: Number, ascentM: Number, descentM: Number },
  },
  { _id: false },
);

const trailSchema = new mongoose.Schema(
  {
    // The user who added the trail. Only they can change it.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: [true, 'Give the trail a title.'], trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    activity: { type: String, enum: ACTIVITIES, default: 'ride' },
    youtubeId: { type: String, required: true, match: /^[A-Za-z0-9_-]{11}$/ },
    supportUrl: {
      type: String,
      trim: true,
      default: '',
      validate: { validator: isWebLink, message: 'The support link must start with http:// or https://.' },
    },

    // The GPS route as [[lat, lng], ...], usually from a GPX file.
    track: {
      type: [[Number]],
      default: [],
      validate: {
        validator: (track) =>
          track.length <= MAX_TRACK_POINTS &&
          track.every((p) => p.length === 2 && isLatitude(p[0]) && isLongitude(p[1])),
        message: `The route must be a list of [latitude, longitude] pairs (at most ${MAX_TRACK_POINTS}).`,
      },
    },
    // Seconds since the recording started, one per track point. Empty when
    // the GPX file had no times, in which case the map can't follow the video.
    trackTimes: { type: [Number], default: [] },
    recordedAt: { type: Date }, // when the GPS recording started
    // How far into the GPS recording the video starts, in seconds.
    videoStartsAt: { type: Number, default: 0 },
    // Where the route came from: a GPX recording, or drawn between the key points
    // (then trackTimes are estimated video times, and the route is approximate).
    routeSource: { type: String, enum: ['gpx', 'keypoints'] },
    // Goes up by one whenever the shape of the route changes. Whatever was
    // worked out for a route (heights, services, stats) records the version
    // it was made for; a different version means it's out of date.
    routeVersion: { type: Number, default: 0 },
    elevationProfile: { type: elevationProfileSchema, default: undefined },
    routeStyle: { type: String, enum: ROUTE_STYLES, default: 'roads' },
    hiddenRanges: { type: [hiddenRangeSchema], default: [] },
    // Set when an AI analysis was accepted, to trace and evaluate it.
    ai: {
      job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
      model: String,
      promptVersion: String,
      analyzedAt: Date,
    },

    points: {
      type: [keyPointSchema],
      default: [],
      validate: { validator: (points) => points.length <= MAX_KEY_POINTS, message: `A trail can have at most ${MAX_KEY_POINTS} key points.` },
    },
  },
  { timestamps: true },
);

trailSchema.path('trackTimes').validate({
  validator(times) {
    if (times.length === 0) return true;
    if (times.length !== this.track.length) return false;
    return times.every((t, i) => Number.isFinite(t) && (i === 0 || t >= times[i - 1]));
  },
  message: 'Route times must match the route points one for one and never go backwards.',
});

export const Trail = mongoose.model('Trail', trailSchema);
