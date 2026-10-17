import { expect, test } from 'vitest';
import { cardSummary, climbText, daysText, distanceText, explain, highestText } from './stats.js';

test('distance: exact for GPS routes, rounded to 5 km with ≈ for drawn ones', () => {
  expect(distanceText({ distanceM: 475400 })).toBe('475 km');
  expect(distanceText({ distanceM: 9300 })).toBe('9.3 km');
  expect(distanceText({ distanceM: 473400, approximate: true })).toBe('≈ 475 km');
  expect(distanceText({ distanceM: 1200, approximate: true })).toBe('≈ 5 km');
  expect(distanceText({})).toBeNull();
});

test('days', () => {
  expect(daysText({ days: 1 })).toBe('1 day');
  expect(daysText({ days: 2 })).toBe('2 days');
  expect(daysText({})).toBeNull();
});

test('highest point: named after a key point, or placed by distance', () => {
  expect(highestText({ highestM: 5328, highestAlongM: 395000, highestName: 'Taglang La' })).toBe('Highest 5,328 m · Taglang La');
  expect(highestText({ highestM: 5328, highestAlongM: 395000 })).toBe('Highest 5,328 m · at km 395');
  expect(highestText({})).toBeNull();
});

test('climb', () => {
  expect(climbText({ ascentM: 5840 })).toBe('5,840 m climb');
  expect(climbText({})).toBeNull();
});

test('each number says how it was worked out', () => {
  expect(explain({ daysSource: 'gps', nights: [{}] }).days).toMatch(/GPS recording: 1 overnight stop/);
  expect(explain({ daysSource: 'stops', nights: [{}, {}] }).days).toMatch(/2 overnight stops/);
  expect(explain({ approximate: true }).distance).toMatch(/estimate/);
});

test('cardSummary leaves out what is unknown', () => {
  expect(cardSummary({ distanceM: 475000, days: 2 })).toBe('475 km · 2 days');
  expect(cardSummary({ distanceM: 475000 })).toBe('475 km');
  expect(cardSummary(undefined)).toBe('');
});
