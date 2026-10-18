import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import { loadUser } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { applyRateLimits, rateLimitsOn } from './middleware/rateLimits.js';
import { aiRouteAvailable, routeConfig } from './config.js';
import { authRouter } from './routes/auth.js';
import { feedbackRouter } from './routes/feedback.js';
import { jobsRouter } from './routes/jobs.js';
import { placesRouter } from './routes/places.js';
import { trailsRouter } from './routes/trails.js';
import { googleClientId } from './services/google.js';
import { roadRoutingAvailable } from './services/routing.js';

export function createApp() {
  const app = express();
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
