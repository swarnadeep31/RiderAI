import { Router } from 'express';
import { login, logout, me, saveOnboarding, signup } from '../controllers/authController.js';
import { requireUser } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/signup', signup);
authRouter.post('/login', login);
authRouter.post('/logout', logout);
authRouter.get('/me', me);
authRouter.put('/onboarding', requireUser, saveOnboarding);
