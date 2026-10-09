import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { httpError } from '../utils/httpError.js';

// Logged-in users carry a signed token in a cookie. JavaScript in the browser
// can't read an httpOnly cookie, so a malicious script can't steal it.
const COOKIE_NAME = 'trailcast_session';
const SESSION_DAYS = 30;
const DEV_SECRET = 'dev-only-secret-do-not-use-in-production';

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production.');
  return DEV_SECRET;
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production', // HTTPS only once the site is online
});

export function startSession(res, user) {
  const token = jwt.sign({ sub: user.id }, jwtSecret(), { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

export function endSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

// Runs on every request: if a valid session cookie came with it, req.user is that user.
export async function loadUser(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  let userId;
  try {
    userId = jwt.verify(token, jwtSecret()).sub;
  } catch {
    return next(); // expired or tampered with: treat as logged out
  }
  req.user = await User.findById(userId);
  next();
}

// Put this before routes that need a logged-in user.
export function requireUser(req, res, next) {
  next(req.user ? undefined : httpError(401, 'Please log in first.'));
}
