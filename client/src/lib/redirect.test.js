import { expect, test } from 'vitest';
import { safeNext } from './redirect.js';

test('keeps paths on this site', () => {
  expect(safeNext('/new')).toBe('/new');
  expect(safeNext('/trails/abc?edit=1')).toBe('/trails/abc?edit=1');
});

test('sends anything else to the home page', () => {
  for (const next of [null, undefined, '', 'new', 'https://evil.example', '//evil.example', 'javascript:alert(1)']) {
    expect(safeNext(next)).toBe('/');
  }
});
