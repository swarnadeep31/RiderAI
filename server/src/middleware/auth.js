import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { httpError } from '../utils/httpError.js';

// Logged-in users carry a signed token in a cookie. JavaScript in the browser
// can't read an httpOnly cookie, so a malicious script can't steal it.
const COOKIE_NAME = 'trailcast_session';
const SESSION_DAYS = 30;
// Logins kept per account: a new one past this logs out the oldest device.
export const MAX_SESSIONS = 10;
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

// A new login for this device: its id (sid) is saved on the account, and with
// the account's session version (sv) it's part of the cookie (see loadUser).
export async function startSession(res, user) {
  const sid = randomUUID();
  await User.updateOne({ _id: user._id }, { $push: { sessions: { $each: [{ id: sid, startedAt: new Date() }], $slice: -MAX_SESSIONS } } });
  const token = jwt.sign({ sub: user.id, sv: user.sessionVersion ?? 0, sid }, jwtSecret(), { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

// Logs this device out: its login is removed from the account, so the cookie
// (or any copy of it) no longer works. A login from before logins were kept
// can't be told apart from the others, so it logs the account out everywhere.
export async function endSession(req, res) {
  if (req.user && req.sessionId) await User.updateOne({ _id: req.user._id }, { $pull: { sessions: { id: req.sessionId } } });
  else if (req.user) await User.updateOne({ _id: req.user._id }, { $inc: { sessionVersion: 1 }, $set: { sessions: [] } });
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

// Logs the account out on every device, this one included.
export async function endAllSessions(req, res) {
  await User.updateOne({ _id: req.user._id }, { $inc: { sessionVersion: 1 }, $set: { sessions: [] } });
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

// Runs on every request: if a valid session cookie came with it, req.user is
// that user (and req.sessionId this device's login). A login that was logged
// out, or from before the account's session version was raised, no longer
// counts. Logins from before logins were kept (no sid) still count, as do
// those from before session versions existed (version 0).
export async function loadUser(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  let session;
  try {
    session = jwt.verify(token, jwtSecret());
  } catch {
    return next(); // expired or tampered with: treat as logged out
  }
  const user = await User.findById(session.sub).select('+sessions');
  const current =
    user && (user.sessionVersion ?? 0) === (session.sv ?? 0) && (!session.sid || user.sessions.some((s) => s.id === session.sid));
  if (current) {
    req.user = user;
    req.sessionId = session.sid ?? null;
  }
  next();
}

// Put this before routes that need a logged-in user.
export function requireUser(req, res, next) {
  next(req.user ? undefined : httpError(401, 'Please log in first.'));
}
