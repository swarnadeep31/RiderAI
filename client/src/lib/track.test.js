import { describe, expect, test } from 'vitest';
import { boundsOf, hiddenRangeAt, indexAtOrBefore, isGpxRoute, nearestIndex, positionAt, travelledAt } from './track.js';

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
