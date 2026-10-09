import { Router } from 'express';
import { sendFeedback } from '../controllers/feedbackController.js';
import { requireUser } from '../middleware/auth.js';

export const feedbackRouter = Router();

feedbackRouter.post('/', requireUser, sendFeedback);
