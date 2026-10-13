import { describe, expect, test } from 'vitest';
import { formatKm, formatMetres, heightAxis, kmTicks, nameNear, niceStep, notablePeaks } from './elevation.js';

test('niceStep picks round steps', () => {
  expect(niceStep(3300, 3)).toBe(2000);
  expect(niceStep(950, 3)).toBe(500);
  expect(niceStep(475, 5)).toBe(100);
  expect(niceStep(12, 5)).toBe(5);
});

describe('heightAxis', () => {
  test('starts at a round number below the lowest point, so the climbs show', () => {
    expect(heightAxis([2050, 5328])).toEqual({ min: 2000, max: 6000, ticks: [2000, 4000, 6000] });
    expect(heightAxis([2050, 3002])).toEqual({ min: 2000, max: 3500, ticks: [2000, 2500, 3000, 3500] });
  });

  test('a flat ride still gets an axis', () => {
    expect(heightAxis([12, 12])).toEqual({ min: 0, max: 50, ticks: [0, 50] });
  });
});

test('kmTicks', () => {
  expect(kmTicks(475000)).toEqual([0, 100, 200, 300, 400]);
  expect(kmTicks(9300)).toEqual([0, 2, 4, 6, 8]);
});

test('formatting', () => {
  expect(formatMetres(5328.4)).toBe('5,328');
  expect(formatKm(12540)).toBe('13');
  expect(formatKm(4540)).toBe('4.5');
});

describe('naming a spot after the nearest key point', () => {
  // Along the equator, 0.1 degrees is 11.1 km.
  const points = [
    { name: 'Far end', lat: 0.001, lng: 0.2 },
    { name: 'Start', lat: 0, lng: 0 },
  ];

  test('within 10 km, or nothing', () => {
    expect(nameNear(points, [0, 0.03])).toBe('Start');
    expect(nameNear(points, [0, 0.18])).toBe('Far end');
    expect(nameNear(points, [0, 0.1])).toBeNull();
  });
});

test('notablePeaks finds the passes, not every bump', () => {
  const d = Array.from({ length: 9 }, (_, i) => i * 1000);
  // Up to a pass at 3,000 m, down to 2,500, a 20 m bump, up to 3,400, then down.
  const e = [2000, 2600, 3000, 2500, 2520, 2510, 3400, 3000, 2900];
  expect(notablePeaks({ d, e })).toEqual([
    { alongM: 6000, heightM: 3400, riseM: 500 },
    { alongM: 2000, heightM: 3000, riseM: 500 },
  ]);
});
