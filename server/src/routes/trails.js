import { Router } from 'express';
import mongoose from 'mongoose';
import {
  addPoint,
  createTrail,
  deletePoint,
  deleteTrail,
  getTrail,
  listTrails,
  updatePoint,
  updateTrail,
} from '../controllers/trailsController.js';
import { requireUser } from '../middleware/auth.js';
import { httpError } from '../utils/httpError.js';

export const trailsRouter = Router();

// A malformed ID can't belong to any trail or key point.
function checkId(req, res, next, id) {
  next(mongoose.isValidObjectId(id) ? undefined : httpError(404, 'Not found.'));
}
trailsRouter.param('id', checkId);
trailsRouter.param('pointId', checkId);

// Anyone can watch...
trailsRouter.get('/', listTrails);
trailsRouter.get('/:id', getTrail);

// ...but adding and changing trails needs an account.
trailsRouter.post('/', requireUser, createTrail);
trailsRouter.patch('/:id', requireUser, updateTrail);
trailsRouter.delete('/:id', requireUser, deleteTrail);

trailsRouter.post('/:id/points', requireUser, addPoint);
trailsRouter.patch('/:id/points/:pointId', requireUser, updatePoint);
trailsRouter.delete('/:id/points/:pointId', requireUser, deletePoint);
