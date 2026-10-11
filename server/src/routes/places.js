import { Router } from 'express';
import { findPlaces } from '../controllers/placesController.js';
import { requireUser } from '../middleware/auth.js';

export const placesRouter = Router();

// Logged-in users only, to keep within the free search service's limits.
placesRouter.get('/', requireUser, findPlaces);
