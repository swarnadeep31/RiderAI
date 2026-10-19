import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import { loadUser } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { applyRateLimits, rateLimitsOn } from './middleware/rateLimits.js';
import { aiConfig, aiRouteAvailable, routeConfig } from './config.js';
import { authRouter } from './routes/auth.js';
import { feedbackRouter } from './routes/feedback.js';
import { jobsRouter } from './routes/jobs.js';
import { placesRouter } from './routes/places.js';
import { trailsRouter } from './routes/trails.js';
import { googleClientId } from './services/google.js';
import { roadRoutingAvailable } from './services/routing.js';

// Sent with every answer. The API only answers with data (JSON), never pages,
// so: nothing in an answer may run or load anything, no answer is shown inside
// another site's frame, the browser never guesses a different content type,
// and no address is passed on as the referrer.
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function createApp() {
  const app = express();
  // Don't announce what the server runs on.
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set(SECURITY_HEADERS);
    next();
  });
  // Answers are JSON, which gzip makes about five times smaller: a long route
  // goes from ~760 KB to ~150 KB.
  app.use(compression());
  // Routes from long GPS recordings can be a few MB.
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(loadUser);
  if (rateLimitsOn()) applyRateLimits(app);

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  // What this server can do, so the website can explain missing features.
  app.get('/api/config', (req, res) =>
    res.json({
      roadRouting: roadRoutingAvailable(),
      aiRoute: aiRouteAvailable(),
      // The biggest video file the AI takes, so the page can say so before uploading.
      aiMaxUploadMb: aiConfig().maxUploadMb,
      routeServices: routeConfig().services,
      fuelGapWarnKm: routeConfig().fuelGapWarnKm,
      // For the "Continue with Google" button (empty: no button).
      googleClientId: googleClientId(),
    }),
  );
  app.use('/api/auth', authRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/places', placesRouter);
  app.use('/api/trails', trailsRouter);
  app.use('/api', notFound);

  app.use(errorHandler);
  return app;
}
