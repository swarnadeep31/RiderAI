import { Router } from 'express';
import { acceptAiRoute, latestAiRoute, startAiFromTranscript, startAiRoute, uploadAiVideo } from '../controllers/aiRouteController.js';
import {
  addPoint,
  createTrail,
  deletePoint,
  deleteTrail,
  drawRoute,
  getTrail,
  listTrails,
  updatePoint,
  updateTrail,
  videoInfo,
} from '../controllers/trailsController.js';
import { enrichNow, getServices } from '../controllers/servicesController.js';
import { requireUser } from '../middleware/auth.js';
import { checkObjectId } from '../middleware/validId.js';

export const trailsRouter = Router();

trailsRouter.param('id', checkObjectId);
trailsRouter.param('pointId', checkObjectId);

// Anyone can watch...
trailsRouter.get('/', listTrails);
// What a YouTube video is called (logged in, while adding a trail).
trailsRouter.get('/video-info', requireUser, videoInfo);
trailsRouter.get('/:id', getTrail);
trailsRouter.get('/:id/services', getServices);

// ...but adding and changing trails needs an account.
trailsRouter.post('/', requireUser, createTrail);
trailsRouter.patch('/:id', requireUser, updateTrail);
trailsRouter.delete('/:id', requireUser, deleteTrail);
trailsRouter.post('/:id/route', requireUser, drawRoute);
// Work out the heights, services and stats again (owner only, a few times a day).
trailsRouter.post('/:id/enrich', requireUser, enrichNow);

// Building the route with AI (owner only): start, check the latest, accept the reviewed places.
trailsRouter.get('/:id/ai-route', requireUser, latestAiRoute);
trailsRouter.post('/:id/ai-route', requireUser, startAiRoute);
// ...or from a video file the owner uploads (the request body is the file).
trailsRouter.post('/:id/ai-route/upload', requireUser, uploadAiVideo);
// ...or from the video's transcript, which the owner pastes (the cheapest).
trailsRouter.post('/:id/ai-route/transcript', requireUser, startAiFromTranscript);
trailsRouter.post('/:id/ai-route/accept', requireUser, acceptAiRoute);

trailsRouter.post('/:id/points', requireUser, addPoint);
trailsRouter.patch('/:id/points/:pointId', requireUser, updatePoint);
trailsRouter.delete('/:id/points/:pointId', requireUser, deletePoint);
