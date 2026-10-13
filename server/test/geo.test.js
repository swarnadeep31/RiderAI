import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceMeters, timedTrack } from '../src/utils/geo.js';

test('distanceMeters', () => {
  // One degree of latitude is about 111.2 km.
  assert.ok(Math.abs(distanceMeters([10, 20], [11, 20]) - 111195) < 10);
  assert.equal(distanceMeters([32.2, 77.1], [32.2, 77.1]), 0);
});

test('timedTrack spreads the time between key points by distance travelled', () => {
  const points = [
    { time: 100, lat: 0, lng: 0 },
    { time: 400, lat: 0, lng: 0.03 },
  ];
  // 2 km, then 1 km: the middle point is passed two thirds of the way through.
  const segments = [[[0, 0], [0, 0.02], [0, 0.03]]];
  const { track, trackTimes } = timedTrack(points, segments);
  assert.deepEqual(track, [[0, 0], [0, 0.02], [0, 0.03]]);
  assert.deepEqual(trackTimes, [100, 300, 400]);
});

test('timedTrack joins pieces without repeating the key points between them', () => {
  const points = [
    { time: 0, lat: 0, lng: 0 },
    { time: 60, lat: 0, lng: 0.01 },
    { time: 60, lat: 0, lng: 0.02 }, // two places mentioned at the same moment
    { time: 90, lat: 0, lng: 0.03 },
  ];
  const segments = [
    [[0, 0], [0, 0.01]],
    [[0, 0.01], [0, 0.02]],
    [[0, 0.02], [0, 0.03]],
  ];
  const { track, trackTimes } = timedTrack(points, segments);
  assert.equal(track.length, 4);
  assert.deepEqual(trackTimes, [0, 60, 60, 90]);
});

test('timedTrack thins out very long routes, keeping the start and end', () => {
  const points = [
    { time: 0, lat: 0, lng: 0 },
    { time: 100, lat: 0, lng: 1 },
  ];
  const segment = Array.from({ length: 101 }, (_, i) => [0, i / 100]);
  const { track, trackTimes } = timedTrack(points, [segment], 11);
  assert.equal(track.length, 11);
  assert.deepEqual(track[0], [0, 0]);
  assert.deepEqual(track.at(-1), [0, 1]);
  assert.equal(trackTimes.at(-1), 100);
  assert.ok(trackTimes.every((t, i) => i === 0 || t >= trackTimes[i - 1]));
});

test('timedTrack makes the marker wait at a stop, then ride on', () => {
  const points = [
    { time: 100, stayUntil: 160, lat: 0, lng: 0 }, // a 1-minute chai break
    { time: 400, lat: 0, lng: 0.02 },
  ];
  const segments = [[[0, 0], [0, 0.01], [0, 0.02]]];
  const { track, trackTimes } = timedTrack(points, segments);
  assert.deepEqual(track, [[0, 0], [0, 0], [0, 0.01], [0, 0.02]]);
  // Waits from 100 to 160, then covers the road between 160 and 400.
  assert.deepEqual(trackTimes, [100, 160, 280, 400]);
});

test('timedTrack: a stop never lasts past the next place, and the last place can be a stop', () => {
  const points = [
    { time: 0, stayUntil: 999, lat: 0, lng: 0 },
    { time: 100, stayUntil: 150, lat: 0, lng: 0.01 },
  ];
  const { trackTimes } = timedTrack(points, [[[0, 0], [0, 0.01]]]);
  assert.deepEqual(trackTimes, [0, 100, 100, 150]);
});
