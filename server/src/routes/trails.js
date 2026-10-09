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
import { httpError } from '../utils/httpError.js';

export const trailsRouter = Router();

// A malformed ID can't belong to any trail or key point.
function checkId(req, res, next, id) {
  next(mongoose.isValidObjectId(id) ? undefined : httpError(404, 'Not found.'));
}
trailsRouter.param('id', checkId);
trailsRouter.param('pointId', checkId);

trailsRouter.get('/', listTrails);
trailsRouter.post('/', createTrail);
trailsRouter.get('/:id', getTrail);
trailsRouter.patch('/:id', updateTrail);
trailsRouter.delete('/:id', deleteTrail);

trailsRouter.post('/:id/points', addPoint);
trailsRouter.patch('/:id/points/:pointId', updatePoint);
trailsRouter.delete('/:id/points/:pointId', deletePoint);
