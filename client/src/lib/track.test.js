import { describe, expect, test } from 'vitest';
import cases from '../../../server/test/fixtures/route-geometry.json';
import {
  boundsOf,
  cumulativeDistances,
  distanceAtTime,
  hiddenRangeAt,
  indexAtOrBefore,
  isGpxRoute,
  locationAtDistance,
  nearestIndex,
  positionAt,
  projectOnTrack,
  timeAtDistance,
  travelledAt,
} from './track.js';

const track = [
  [10, 20],
  [10, 21],
  [11, 21],
];
const times = [0, 100, 200];

describe('positionAt', () => {
  test('follows the route as the video plays', () => {
    expect(positionAt(track, times, 0, 0)).toEqual([10, 20]);
    expect(positionAt(track, times, 0, 50)).toEqual([10, 20.5]);
    expect(positionAt(track, times, 0, 150)).toEqual([10.5, 21]);
    expect(positionAt(track, times, 0, 200)).toEqual([11, 21]);
  });

  test('allows for the video starting partway through the recording', () => {
    expect(positionAt(track, times, 100, 0)).toEqual([10, 21]);
    expect(positionAt(track, times, 100, 50)).toEqual([10.5, 21]);
  });

  test('is null outside the recording or without times', () => {
    expect(positionAt(track, times, 0, 201)).toBeNull();
    expect(positionAt(track, times, -10, 5)).toBeNull();
    expect(positionAt(track, [], 0, 50)).toBeNull();
  });

  test('copes with two points recorded at the same second', () => {
    expect(positionAt(track, [0, 0, 10], 0, 0)).toEqual([10, 21]);
  });
});

test('nearestIndex finds the closest route point', () => {
  expect(nearestIndex(track, [10.1, 20.1])).toBe(0);
  expect(nearestIndex(track, [10.9, 21.2])).toBe(2);
  expect(nearestIndex([], [0, 0])).toBe(-1);
});

test('boundsOf', () => {
  expect(boundsOf(track)).toEqual([
    [10, 20],
    [11, 21],
  ]);
  expect(boundsOf([])).toBeNull();
});

test('isGpxRoute', () => {
  expect(isGpxRoute({ track, routeSource: 'gpx' })).toBe(true);
  expect(isGpxRoute({ track })).toBe(true); // trails from before routes could be drawn
  expect(isGpxRoute({ track, routeSource: 'keypoints' })).toBe(false);
  expect(isGpxRoute({ track: [] })).toBe(false);
});

test('no position during hidden parts of the video', () => {
  const hidden = [{ start: 40, end: 60, reason: 'montage' }];
  expect(positionAt(track, times, 0, 50, hidden)).toBeNull();
  expect(positionAt(track, times, 0, 60, hidden)).toEqual([10, 20.6]);
  expect(hiddenRangeAt(hidden, 45)).toEqual(hidden[0]);
  expect(hiddenRangeAt(hidden, 61)).toBeNull();
});

test('indexAtOrBefore', () => {
  expect(indexAtOrBefore(times, -1)).toBe(-1);
  expect(indexAtOrBefore(times, 0)).toBe(0);
  expect(indexAtOrBefore(times, 150)).toBe(1);
  expect(indexAtOrBefore(times, 999)).toBe(2);
});

test('travelledAt: the covered part of the route, ending at the rider', () => {
  expect(travelledAt(track, times, 0, -5)).toEqual([]);
  expect(travelledAt(track, times, 0, 50)).toEqual([
    [10, 20],
    [10, 20.5],
  ]);
  expect(travelledAt(track, times, 0, 150)).toEqual([
    [10, 20],
    [10, 21],
    [10.5, 21],
  ]);
  expect(travelledAt(track, times, 0, 500)).toEqual(track);
});

// The same cases are checked against server/src/utils/geo.js, so both give the same answers.
describe('route geometry (shared cases)', () => {
  const near = (actual, expected, tolerance) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
  const nearPoint = (actual, expected) => {
    near(actual[0], expected[0], 1e-6); // about 0.1 m
    near(actual[1], expected[1], 1e-6);
  };

  test.each(cases.cumulativeDistances)('cumulativeDistances: $track', (c) => {
    const cum = cumulativeDistances(cases.tracks[c.track]);
    expect(cum).toHaveLength(c.expected.length);
    cum.forEach((d, i) => near(d, c.expected[i], 0.05));
  });

  test.each(cases.projectOnTrack)('projectOnTrack: $name', (c) => {
    const track = cases.tracks[c.track];
    const p = projectOnTrack(track, cumulativeDistances(track), c.location, c.window);
    near(p.alongM, c.expected.alongM, 0.05);
    if (c.expected.offM !== undefined) near(p.offM, c.expected.offM, 0.05);
    nearPoint(p.point, c.expected.point);
  });

  test.each(cases.locationAtDistance)('locationAtDistance: $alongM m', (c) => {
    const track = cases.tracks[c.track];
    nearPoint(locationAtDistance(track, cumulativeDistances(track), c.alongM), c.expected);
  });

  test.each(cases.timeAtDistance)('timeAtDistance: $name', (c) => {
    near(timeAtDistance(cumulativeDistances(cases.tracks[c.track]), cases.times[c.track], c.alongM), c.expected, 0.01);
  });

  test.each(cases.distanceAtTime)('distanceAtTime: $name', (c) => {
    near(distanceAtTime(cumulativeDistances(cases.tracks[c.track]), cases.times[c.track], c.t), c.expected, 0.05);
  });
});
