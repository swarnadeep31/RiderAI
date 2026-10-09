import mongoose from 'mongoose';

// Onboarding answers. Must match client/src/lib/onboarding.js.
export const INTERESTS = ['riding', 'trekking', 'climbing', 'cycling', 'camping', 'travel', 'other'];
export const REFERRAL_SOURCES = ['friend', 'youtube', 'instagram', 'search', 'other'];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Enter your email address.'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'],
    },
    username: {
      type: String,
      required: [true, 'Choose a username.'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Usernames need at least 3 characters.'],
      maxlength: [30, 'Usernames can have at most 30 characters.'],
      match: [/^[a-z0-9_]+$/, 'Usernames can only use letters, numbers and _.'],
    },
    // Never the password itself: a bcrypt hash of it. Left out of queries unless asked for.
    passwordHash: { type: String, required: true, select: false },

    // Asked once after signing up. "What will you use TrailCast for?" is required...
    interests: { type: [{ type: String, enum: INTERESTS }], default: [] },
    // ...these two are optional.
    referralSource: { type: String, enum: [...REFERRAL_SOURCES, ''], default: '' },
    wishlist: { type: String, trim: true, maxlength: 1000, default: '' },
    onboardedAt: { type: Date },
  },
  {
    timestamps: true,
    // Make sure the hash is never sent to the browser, even if it was loaded.
    toJSON: {
      transform(doc, user) {
        delete user.passwordHash;
        delete user.__v;
        return user;
      },
    },
  },
);

export const User = mongoose.model('User', userSchema);
