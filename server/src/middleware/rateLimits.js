// How often one visitor, account or logged-in user may do things, so nobody
// can guess passwords, flood sign-ups, or use up the free services (route
// drawing, place search, Gemini) that everyone shares. Counts are kept in this
// server's memory (one server), and start again when it restarts.
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { normalizePhone } from '../models/User.js';

const MINUTE = 60 * 1000;

// On by default; tests switch them off, except the tests of the limits.
export const rateLimitsOn = () => process.env.RATE_LIMITS !== 'off';

// The visitor's address. The website's /api requests come through Vercel,
// which replaces X-Forwarded-For with the visitor's real address, so its first
// entry is right for everyone using the website (Render then adds its own
// entries after it). Someone calling the server's own address directly could
// write anything there, so the limits that matter most count per account or
// per logged-in user instead.
export function clientAddress(req) {
  const forwarded = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

// The account someone is logging in to: their email or phone number, as stored.
function accountOf(body) {
  if (typeof body?.phone === 'string' && body.phone) {
    const phone = normalizePhone(body.phone);
    return phone && `phone:${phone}`;
  }
  if (typeof body?.email === 'string' && body.email) return `email:${body.email.trim().toLowerCase()}`;
  return null;
}

const KEYS = {
  // IPv6 addresses count per /56 network, as one person usually has a whole range.
  address: (req) => `address:${ipKeyGenerator(clientAddress(req))}`,
  account: (req) => accountOf(req.body) ?? `address:${ipKeyGenerator(clientAddress(req))}`,
  user: (req) => `user:${req.user._id}`,
};

function limit({ minutes, max, by = 'address', message, onlyFailures = false }) {
  return rateLimit({
    windowMs: minutes * MINUTE,
    limit: max,
    keyGenerator: KEYS[by],
    // Per-user limits only apply once logged in (requireUser turns the others away).
    skip: by === 'user' ? (req) => !req.user : undefined,
    skipSuccessfulRequests: onlyFailures,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: message }),
    // The address is read from X-Forwarded-For on purpose (see clientAddress).
    validate: { xForwardedForHeader: false },
  });
}

const wait = (what) => `${what} Please wait a few minutes and try again.`;

// Each limit's own window, so one burst can't use up another's allowance.
export function applyRateLimits(app) {
  // Everything, from one address: a backstop far above what a person clicks.
  app.use('/api', limit({ minutes: 1, max: 300, message: wait('Too many requests from your network.') }));

  // Logging in: failed tries per account (password guessing), and per address.
  app.post(
    '/api/auth/login',
    limit({ minutes: 15, max: 8, by: 'account', onlyFailures: true, message: wait('Too many tries to log in to this account.') }),
    limit({ minutes: 15, max: 30, onlyFailures: true, message: wait('Too many tries to log in.') }),
  );
  app.post('/api/auth/signup', limit({ minutes: 60, max: 10, message: wait('Too many new accounts from your network.') }));
  app.post('/api/auth/google', limit({ minutes: 15, max: 30, message: wait('Too many tries to log in with Google.') }));

  // Logged-in actions, per user.
  app.post('/api/feedback', limit({ minutes: 60, max: 10, by: 'user', message: wait("That's a lot of feedback at once. Thank you!") }));
  // Place search asks a free service that allows one search a second for the whole server.
  app.get('/api/places', limit({ minutes: 1, max: 20, by: 'user', message: wait('Too many place searches.') }));
  app.post('/api/trails', limit({ minutes: 60, max: 30, by: 'user', message: wait('Too many new trails.') }));
  // Drawing a route asks OpenRouteService, whose free daily allowance everyone shares;
  // adding, moving or removing a key point redraws a drawn route.
  const routeWork = limit({ minutes: 10, max: 60, by: 'user', message: wait('Too many route changes.') });
  app.post('/api/trails/:id/route', routeWork);
  app.post('/api/trails/:id/ai-route/accept', routeWork);
  app.post('/api/trails/:id/points', routeWork);
  app.patch('/api/trails/:id/points/:pointId', routeWork);
  app.delete('/api/trails/:id/points/:pointId', routeWork);
  // Starting AI analyses (each user also has a daily allowance).
  const aiStarts = limit({ minutes: 60, max: 10, by: 'user', message: wait('Too many AI analyses started.') });
  app.post('/api/trails/:id/ai-route', aiStarts);
  app.post('/api/trails/:id/ai-route/upload', aiStarts);
  app.post('/api/trails/:id/ai-route/transcript', aiStarts);
  // Looking up a video's title asks YouTube.
  app.get('/api/trails/video-info', limit({ minutes: 1, max: 20, by: 'user', message: wait('Too many video look-ups.') }));
}
