// Turns any error thrown by a route into a JSON answer: { error: "message" }.
// Express 5 sends errors from async route handlers here automatically.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((e) => (e.name === 'CastError' ? `"${e.path}" has the wrong type.` : e.message))
      .join(' ');
    return res.status(400).json({ error: message });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: `"${err.path}" has the wrong type.` });
  // MongoDB refused a duplicate of a unique field (e.g. two sign-ups with one email at the same moment).
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'value';
    return res.status(409).json({ error: `That ${field} is already taken.` });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too big.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (err.status) return res.status(err.status).json({ error: err.message });

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}

export function notFound(req, res) {
  res.status(404).json({ error: `No API route for ${req.method} ${req.path}` });
}
