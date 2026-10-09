import bcrypt from 'bcryptjs';
import { endSession, startSession } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { httpError } from '../utils/httpError.js';

const MIN_PASSWORD_LENGTH = 8;
const normalize = (text) => String(text ?? '').trim().toLowerCase();

export async function signup(req, res) {
  const { email, username, password } = req.body ?? {};
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 200) throw httpError(400, 'That password is too long.');

  if (await User.exists({ email: normalize(email) })) {
    throw httpError(409, 'That email already has an account. Try logging in instead.');
  }
  if (await User.exists({ username: normalize(username) })) throw httpError(409, 'That username is taken.');

  const user = await User.create({ email, username, passwordHash: await bcrypt.hash(password, 12) });
  startSession(res, user);
  res.status(201).json(user);
}

export async function login(req, res) {
  const { email, password } = req.body ?? {};
  const user = await User.findOne({ email: normalize(email) }).select('+passwordHash');
  const correct = user && typeof password === 'string' && (await bcrypt.compare(password, user.passwordHash));
  // The same message either way, so nobody can test which emails have accounts.
  if (!correct) throw httpError(401, 'Wrong email or password.');
  startSession(res, user);
  res.json(user);
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
