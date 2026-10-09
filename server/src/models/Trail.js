import mongoose from 'mongoose';

export const ACTIVITIES = ['ride', 'hike', 'climb', 'cycle', 'other'];
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
});

const trailSchema = new mongoose.Schema(
  {
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
