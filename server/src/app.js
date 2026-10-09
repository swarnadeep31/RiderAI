import express from 'express';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { trailsRouter } from './routes/trails.js';

export function createApp() {
  const app = express();
  // Routes from long GPS recordings can be a few MB.
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/trails', trailsRouter);
  app.use('/api', notFound);

  app.use(errorHandler);
  return app;
}
