import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './api.js';
import { errorCodeFor, serverWords } from './pages/ErrorPage.jsx';

// What a failed call throws decides which error page shows (see ErrorPage.jsx).
describe('a failed API call', () => {
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status, body, type = 'application/json') =>
    vi.stubGlobal('fetch', async () => new Response(body, { status, headers: { 'Content-Type': type } }));
  const failure = (call) => call.then(() => expect.fail('it should have failed'), (err) => err);

  test("the hosting's own page instead of the server's words (a sleeping server): status kept, plain words", async () => {
    answer(504, '<html>Gateway Timeout</html>', 'text/html');
    const err = await failure(api.getTrail('abc'));
    expect(err.status).toBe(504);
    expect(err.message).toMatch(/took too long to answer/);
    expect(errorCodeFor(err)).toBe(504);
    expect(serverWords(err)).toBeNull();
  });

  test("the server's own words come through with the status", async () => {
    answer(403, JSON.stringify({ error: 'Only the person who added this trail can change it.' }));
    const err = await failure(api.getTrail('abc'));
    expect(err.status).toBe(403);
    expect(serverWords(err)).toBe('Only the person who added this trail can change it.');
  });

  test('no answer at all: status 0, the page for no connection', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await failure(api.getTrail('abc'));
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Couldn't reach TrailCast|offline/);
    expect(errorCodeFor(err)).toBe('network');
  });
});
