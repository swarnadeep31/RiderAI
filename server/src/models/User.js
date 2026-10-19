import mongoose from 'mongoose';

// Onboarding answers. Must match client/src/lib/onboarding.js.
export const INTERESTS = ['riding', 'trekking', 'climbing', 'cycling', 'camping', 'travel', 'other'];
export const REFERRAL_SOURCES = ['friend', 'youtube', 'instagram', 'search', 'other'];

// "+919876543210": a + and 8 to 15 digits, the country code first.
export const PHONE_PATTERN = /^\+\d{8,15}$/;

// Turns what people type ("98765 43210", "+91 (987) 654-3210", "0091...")
// into one form, so the same number always finds the same account. Ten digits
// without a country code are taken as an Indian number. Null if it can't be a phone number.
export function normalizePhone(text) {
  if (typeof text !== 'string') return null;
  let value = text.trim().replace(/[\s().-]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (/^\d{10}$/.test(value)) value = `+91${value}`;
  else if (/^0\d{10}$/.test(value)) value = `+91${value.slice(1)}`;
  return PHONE_PATTERN.test(value) ? value : null;
}

const userSchema = new mongoose.Schema(
  {
    // What other people see: "Swarnadeep Roy".
    name: { type: String, trim: true, maxlength: [60, 'Names can have at most 60 characters.'] },
    // An account has at least one way in: an email, a phone number, or Google.
    email: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'],
    },
    phone: { type: String, trim: true, match: [PHONE_PATTERN, 'Enter a phone number with its country code, like +91 98765 43210.'] },
    // The Google account's id, for "Continue with Google".
    googleId: { type: String },
    // True once the email is known to belong to this person: Google says so.
    // (Anyone can type any email when signing up with a password.)
    emailVerified: { type: Boolean, default: false },
    // Part of every login: raising it logs the account out everywhere.
    sessionVersion: { type: Number, default: 0 },
    // The logins in use, one per device (the newest MAX_SESSIONS). Logging
    // out removes that device's, so a copy of its cookie stops working too.
    sessions: {
      type: [{ id: { type: String, required: true }, startedAt: { type: Date, default: Date.now }, _id: false }],
      default: [],
      select: false,
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
    // Never the password itself: a bcrypt hash of it. Left out of queries
    // unless asked for. Accounts made with Google don't have one.
    passwordHash: {
      type: String,
      select: false,
      required: function needsPassword() {
        return !this.googleId;
      },
    },

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
        delete user.sessionVersion;
        delete user.sessions;
        delete user.__v;
        return user;
      },
    },
  },
);

// Each email, phone number and Google account belongs to one account at most.
// (Only counted when set: an account with just a phone number has no email.)
for (const field of ['email', 'phone', 'googleId']) {
  userSchema.index({ [field]: 1 }, { unique: true, partialFilterExpression: { [field]: { $type: 'string' } } });
}

userSchema.pre('validate', function needsAWayIn() {
  if (!this.email && !this.phone && !this.googleId) this.invalidate('email', 'Enter your email address or phone number.');
});

export const User = mongoose.model('User', userSchema);
