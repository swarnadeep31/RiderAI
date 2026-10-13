// An error that carries the HTTP status the error handler should answer with.
export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
