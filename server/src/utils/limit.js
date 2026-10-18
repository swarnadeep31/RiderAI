import { httpError } from './httpError.js';

// Runs at most `size` tasks at once; the others wait their turn. When
// `maxWaiting` are already waiting, a new one is turned away (503) instead of
// joining an endless queue. Keeps a crowd from using up the server's memory.
export function concurrencyLimit(size, { maxWaiting = Infinity } = {}) {
  let running = 0;
  const waiting = [];

  function next() {
    if (running < size && waiting.length > 0) {
      running += 1;
      waiting.shift()();
    }
  }

  return {
    async run(task) {
      if (running < size) running += 1;
      else {
        if (waiting.length >= maxWaiting) throw httpError(503, 'TrailCast is very busy right now. Please try again in a moment.');
        await new Promise((resolve) => waiting.push(resolve));
      }
      try {
        return await task();
      } finally {
        running -= 1;
        next();
      }
    },
    get running() {
      return running;
    },
    get waiting() {
      return waiting.length;
    },
  };
}
