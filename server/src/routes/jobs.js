import { Router } from 'express';
import { cancelJob, getJob } from '../controllers/jobsController.js';
import { requireUser } from '../middleware/auth.js';
import { checkObjectId } from '../middleware/validId.js';

export const jobsRouter = Router();

jobsRouter.param('id', checkObjectId);
jobsRouter.get('/:id', requireUser, getJob);
jobsRouter.post('/:id/cancel', requireUser, cancelJob);
