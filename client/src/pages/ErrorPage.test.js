import { describe, expect, test } from 'vitest';
import { ERRORS, errorCodeFor, isOldVersion, serverWords } from './ErrorPage.jsx';

describe('error pages', () => {
  test('each has a title, words, a sign for the drawing and a next step', () => {
    for (const [code, error] of Object.entries(ERRORS)) {
      expect([code, Boolean(error.title && error.text && error.sign && error.name)]).toEqual([code, true]);
      expect(['retry', 'login', 'home']).toContain(error.action);
    }
  });

  test('an API error picks its page by status; no status means the server was never reached', () => {
    expect(errorCodeFor({ status: 504 })).toBe(504);
    expect(errorCodeFor({ status: 0 })).toBe('network');
    expect(errorCodeFor(new Error('boom'))).toBe('network');
  });

  test("only a 4xx's own words are shown under it", () => {
    expect(serverWords({ status: 403, message: 'Only the person who added this trail can change it.' })).toMatch(/Only the person/);
    expect(serverWords({ status: 404, message: 'Trail not found.' })).toBeNull();
    expect(serverWords({ status: 502, message: 'Bad gateway' })).toBeNull();
  });

  test('a part of an older version of the site that has gone is told apart from a bug', () => {
    expect(isOldVersion(new TypeError('Failed to fetch dynamically imported module: /assets/TrailPage-abc.js'))).toBe(true);
    expect(isOldVersion(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  });
});
