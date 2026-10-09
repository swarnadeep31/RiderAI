import { describe, expect, test } from 'vitest';
import { boundsOf, nearestIndex, positionAt } from './track.js';

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
