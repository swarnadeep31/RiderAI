import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { endSession, startSession } from '../middleware/auth.js';
import { normalizePhone, User } from '../models/User.js';
import { verifyGoogleCredential } from '../services/google.js';
import { httpError } from '../utils/httpError.js';

const MIN_PASSWORD_LENGTH = 8;
const normalize = (text) => String(text ?? '').trim().toLowerCase();

// An error the sign-up and log-in pages can act on: code 'exists' (offer to
// log in instead) or 'not_found' (offer to sign up instead).
function authError(status, message, code) {
  const err = httpError(status, message);
  err.code = code;
  return err;
}

// The way in someone typed: { email } or { phone }, normalised.
function identifierFrom(body) {
  if (body?.phone) {
    const phone = normalizePhone(String(body.phone));
    if (!phone) throw httpError(400, 'Enter a phone number with its country code, like +91 98765 43210.');
    return { phone };
  }
  if (body?.email) return { email: normalize(body.email) };
  throw httpError(400, 'Enter your email address or phone number.');
}

const describe = (identifier) => (identifier.phone ? 'phone number' : 'email');

// A username for people who don't pick one, from their name or email: "swarnadeep_roy_4821".
async function makeUsername(seed) {
  const base =
    normalize(seed)
      .replace(/@.*/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 20) || 'rider';
  for (let i = 0; i < 20; i++) {
    const candidate = (base.length < 3 ? `${base}_rider` : base) + (i === 0 ? '' : `_${randomInt(1000, 10000)}`);
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  return `rider_${Date.now()}`;
}

// Signs up with a name, an email or phone number, and a password. If that
// email or phone number already has an account, says so (code 'exists').
export async function signup(req, res) {
  const { name, username, password } = req.body ?? {};
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 200) throw httpError(400, 'That password is too long.');
  const displayName = String(name ?? username ?? '').trim();
  if (!displayName) throw httpError(400, 'Enter your name.');

  const identifier = identifierFrom(req.body);
  if (await User.exists(identifier)) {
    throw authError(409, `You already have an account with this ${describe(identifier)}. Please log in.`, 'exists');
  }
  if (username !== undefined && (await User.exists({ username: normalize(username) }))) throw httpError(409, 'That username is taken.');

  const user = await User.create({
    ...identifier,
    name: displayName,
    username: username ?? (await makeUsername(displayName)),
    passwordHash: await bcrypt.hash(password, 12),
  });
  startSession(res, user);
  res.status(201).json(user);
}

// Logs in with an email or phone number and the password. An email or
// number without an account is told so (code 'not_found'), with a way to sign up.
export async function login(req, res) {
  const identifier = identifierFrom(req.body);
  const user = await User.findOne(identifier).select('+passwordHash');
  if (!user) throw authError(404, `There's no account with this ${describe(identifier)} yet. Sign up to create one.`, 'not_found');
  if (!user.passwordHash) throw httpError(401, 'This account uses Google. Use "Continue with Google" to log in.');
  const correct = typeof req.body?.password === 'string' && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!correct) throw httpError(401, 'Wrong password. Try again.');
  startSession(res, user);
  res.json(user);
}

// "Continue with Google", on the log-in and sign-up pages alike: an account
// already linked to this Google account logs in; one with the same email is
// linked to it and logs in (existing: true); otherwise a new account is made
// (201). The answer says which, so the page can tell the person.
//
// Google has checked that the email belongs to the person signing in. An
// account made earlier with that email and a password never proved it: anyone
// can type someone else's email when signing up. So when Google is linked to
// such an account, its password is removed and its other logins end, and the
// account is the Google account owner's alone (passwordRemoved: true, so the
// page can say to log in with Google from now on).
export async function google(req, res) {
  const profile = await verifyGoogleCredential(req.body?.credential);
  if (!profile) throw httpError(401, "Google sign-in didn't work. Please try again.");

  let user = await User.findOne({ googleId: profile.googleId });
  let passwordRemoved = false;
  if (!user) {
    user = await User.findOne({ email: profile.email }).select('+passwordHash');
    if (user) {
      if (!user.emailVerified) {
        passwordRemoved = Boolean(user.passwordHash);
        user.passwordHash = undefined;
        user.sessionVersion = (user.sessionVersion ?? 0) + 1;
      }
      user.googleId = profile.googleId;
      user.emailVerified = true;
      user.name ||= profile.name;
      await user.save();
    }
  }
  if (user) {
    startSession(res, user);
    return res.json({ user, existing: true, passwordRemoved });
  }

  user = await User.create({
    googleId: profile.googleId,
    email: profile.email,
    emailVerified: true,
    name: profile.name || profile.email.split('@')[0],
    username: await makeUsername(profile.name || profile.email),
  });
  startSession(res, user);
  res.status(201).json({ user, existing: false, passwordRemoved });
}

export function logout(req, res) {
  endSession(res);
  res.status(204).end();
}

export function me(req, res) {
  res.json({ user: req.user ?? null });
}

export async function saveOnboarding(req, res) {
  const { interests, referralSource, wishlist } = req.body ?? {};
  if (!Array.isArray(interests) || interests.length === 0) {
    throw httpError(400, 'Pick at least one thing you want to use TrailCast for.');
  }
  req.user.set({
    interests: [...new Set(interests)],
    referralSource: referralSource ?? '',
    wishlist: wishlist ?? '',
    onboardedAt: req.user.onboardedAt ?? new Date(),
  });
  await req.user.save();
  res.json(req.user);
}
