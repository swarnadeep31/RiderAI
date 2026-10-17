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
  videoTimeAtLocation,
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

describe('videoTimeAtLocation', () => {
  // 0.01 degrees of longitude along the equator is 1111.949 m.
  const route = {
    track: [
      [0, 0],
      [0, 0.01],
      [0, 0.01], // a stop: arrives at 100, leaves at 160
      [0, 0.02],
    ],
    trackTimes: [0, 100, 160, 400],
    videoStartsAt: 0,
    hiddenRanges: [],
  };
  route.cum = cumulativeDistances(route.track);

  test('a point on the route becomes the moment the rider passed it', () => {
    const hit = videoTimeAtLocation(route, [0.0005, 0.005]);
    expect(hit.time).toBeCloseTo(50, 1);
    expect(hit.point[1]).toBeCloseTo(0.005, 9);
    expect(hit.outside).toBeNull();
  });

  test('landing on a stop jumps to the arrival, not the departure', () => {
    expect(videoTimeAtLocation(route, [0, 0.01]).time).toBeCloseTo(100, 1);
  });

  test('allows for the video starting partway through the recording', () => {
    expect(videoTimeAtLocation({ ...route, videoStartsAt: 30 }, [0, 0.005]).time).toBeCloseTo(20, 1);
  });

  test('GPS recorded before or after the video is clamped to the video, and says so', () => {
    const before = videoTimeAtLocation({ ...route, videoStartsAt: 80 }, [0, 0.005]);
    expect(before).toMatchObject({ time: 0, outside: 'before' });
    // A second before the end: a video that reaches its very end would start again from the top.
    const after = videoTimeAtLocation(route, [0, 0.019], { duration: 300 });
    expect(after).toMatchObject({ time: 299, outside: 'after' });
  });

  test('a moment inside a skipped part (intro, montage) moves to its end', () => {
    const hit = videoTimeAtLocation({ ...route, hiddenRanges: [{ start: 40, end: 70, reason: 'montage' }] }, [0, 0.005]);
    expect(hit.time).toBe(70);
    expect(hit.hidden.reason).toBe('montage');
  });

  test('a window keeps the search on the road under the pointer', () => {
    const outAndBack = { ...route, track: [[0, 0], [0, 0.01], [0, 0]], trackTimes: [0, 100, 200] };
    outAndBack.cum = cumulativeDistances(outAndBack.track);
    expect(videoTimeAtLocation(outAndBack, [0, 0.004]).time).toBeCloseTo(40, 1);
    expect(videoTimeAtLocation(outAndBack, [0, 0.004], { window: { from: 1, to: 1 } }).time).toBeCloseTo(160, 1);
  });

  test('is null for a route without times', () => {
    expect(videoTimeAtLocation({ ...route, trackTimes: [] }, [0, 0.005])).toBeNull();
  });
});
