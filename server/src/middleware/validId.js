import mongoose from 'mongoose';
import { httpError } from '../utils/httpError.js';

// For router.param(): a malformed ID can't belong to anything, so answer 404.
export function checkObjectId(req, res, next, id) {
  next(mongoose.isValidObjectId(id) ? undefined : httpError(404, 'Not found.'));
}
