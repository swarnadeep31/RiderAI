import { Router } from 'express';
import { acceptAiRoute, latestAiRoute, startAiRoute } from '../controllers/aiRouteController.js';
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
} from '../controllers/trailsController.js';
import { requireUser } from '../middleware/auth.js';
import { checkObjectId } from '../middleware/validId.js';

export const trailsRouter = Router();

trailsRouter.param('id', checkObjectId);
trailsRouter.param('pointId', checkObjectId);

// Anyone can watch...
trailsRouter.get('/', listTrails);
trailsRouter.get('/:id', getTrail);

// ...but adding and changing trails needs an account.
trailsRouter.post('/', requireUser, createTrail);
trailsRouter.patch('/:id', requireUser, updateTrail);
trailsRouter.delete('/:id', requireUser, deleteTrail);
trailsRouter.post('/:id/route', requireUser, drawRoute);

// Building the route with AI (owner only): start, check the latest, accept the reviewed places.
trailsRouter.get('/:id/ai-route', requireUser, latestAiRoute);
trailsRouter.post('/:id/ai-route', requireUser, startAiRoute);
trailsRouter.post('/:id/ai-route/accept', requireUser, acceptAiRoute);

trailsRouter.post('/:id/points', requireUser, addPoint);
trailsRouter.patch('/:id/points/:pointId', requireUser, updatePoint);
trailsRouter.delete('/:id/points/:pointId', requireUser, deletePoint);
