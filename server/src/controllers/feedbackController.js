import { Feedback } from '../models/Feedback.js';

export async function sendFeedback(req, res) {
  await Feedback.create({ user: req.user._id, message: req.body?.message });
  res.status(201).json({ ok: true });
}
