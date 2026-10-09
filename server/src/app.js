import cookieParser from 'cookie-parser';
import express from 'express';
import { loadUser } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { feedbackRouter } from './routes/feedback.js';
import { trailsRouter } from './routes/trails.js';

export function createApp() {
  const app = express();
  // Routes from long GPS recordings can be a few MB.
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(loadUser);

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/trails', trailsRouter);
  app.use('/api', notFound);

  app.use(errorHandler);
  return app;
}
