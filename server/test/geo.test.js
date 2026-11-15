import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  cumulativeDistances,
  distanceAtTime,
  distanceMeters,
  locationAtDistance,
  pauseForHiddenParts,
  projectOnTrack,
  simplify,
  thinSegments,
  timeAtDistance,
  timedTrack,
} from '../src/utils/geo.js';

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

// The same cases are checked against client/src/lib/track.js, so both give the same answers.
const cases = JSON.parse(readFileSync(new URL('./fixtures/route-geometry.json', import.meta.url), 'utf8'));
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
const nearPoint = (actual, expected, label) => {
  near(actual[0], expected[0], 1e-6, `${label} (lat)`); // about 0.1 m
  near(actual[1], expected[1], 1e-6, `${label} (lng)`);
};

describe('route geometry (shared cases)', () => {
  test('cumulativeDistances', () => {
    for (const c of cases.cumulativeDistances) {
      const cum = cumulativeDistances(cases.tracks[c.track]);
      assert.equal(cum.length, c.expected.length);
      cum.forEach((d, i) => near(d, c.expected[i], 0.05, `${c.track}[${i}]`));
    }
  });

  test('projectOnTrack', () => {
    for (const c of cases.projectOnTrack) {
      const track = cases.tracks[c.track];
      const p = projectOnTrack(track, cumulativeDistances(track), c.location, c.window);
      near(p.alongM, c.expected.alongM, 0.05, `${c.name} (alongM)`);
      if (c.expected.offM !== undefined) near(p.offM, c.expected.offM, 0.05, `${c.name} (offM)`);
      nearPoint(p.point, c.expected.point, c.name);
    }
  });

  test('locationAtDistance', () => {
    for (const c of cases.locationAtDistance) {
      const track = cases.tracks[c.track];
      nearPoint(locationAtDistance(track, cumulativeDistances(track), c.alongM), c.expected, `${c.alongM} m`);
    }
  });

  test('timeAtDistance', () => {
    for (const c of cases.timeAtDistance) {
      const cum = cumulativeDistances(cases.tracks[c.track]);
      near(timeAtDistance(cum, cases.times[c.track], c.alongM), c.expected, 0.01, c.name);
    }
  });

  test('distanceAtTime', () => {
    for (const c of cases.distanceAtTime) {
      const cum = cumulativeDistances(cases.tracks[c.track]);
      near(distanceAtTime(cum, cases.times[c.track], c.t), c.expected, 0.05, c.name);
    }
  });
});

test('simplify keeps the corners and drops points on a straight line', () => {
  // A straight road with a wiggle of 5 m, then a right-angle turn.
  const track = [
    [0, 0],
    [0.00004, 0.005], // 4.4 m off the line
    [0, 0.01],
    [0.005, 0.01],
    [0.01, 0.01],
  ];
  assert.deepEqual(simplify(track, 10), [0, 2, 4]);
  assert.deepEqual(simplify(track, 1), [0, 1, 2, 4]);
  assert.deepEqual(simplify(track.slice(0, 2), 100), [0, 1]);
  assert.deepEqual(simplify([], 100), []);
});

test('timedTrack carries heights through stops and thinning out', () => {
  const points = [
    { time: 100, stayUntil: 160, lat: 0, lng: 0 },
    { time: 400, lat: 0, lng: 0.02 },
  ];
  const segments = [[[0, 0, 2000], [0, 0.01, 2050], [0, 0.02, 2100]]];
  const { trackElevations } = timedTrack(points, segments);
  assert.deepEqual(trackElevations, [2000, 2000, 2050, 2100]);

  const long = Array.from({ length: 101 }, (_, i) => [0, i / 100, 1000 + i]);
  const thinned = timedTrack([{ time: 0, lat: 0, lng: 0 }, { time: 100, lat: 0, lng: 1 }], [long], 11);
  assert.deepEqual(thinned.trackElevations, [1000, 1010, 1020, 1030, 1040, 1050, 1060, 1070, 1080, 1090, 1100]);

  const flat = timedTrack(points, [[[0, 0], [0, 0.02]]]);
  assert.ok(flat.trackElevations.every((h) => h === null), 'straight lines have no heights');
});

test('thinSegments keeps the shape of a road and the key points, with far fewer points', () => {
  // A straight road with a point every ~11 m, then a sharp bend.
  const straight = Array.from({ length: 101 }, (_, i) => [0, i / 10000, 100 + i]);
  const bend = Array.from({ length: 50 }, (_, i) => [(i + 1) / 10000, 0.01]);
  const [thinned] = thinSegments([[...straight, ...bend]]);
  assert.deepEqual(thinned, [[0, 0, 100], [0, 0.01, 200], [0.005, 0.01]]);

  // Still too many for maxPoints: thinned harder until it fits, ends kept.
  const wiggly = Array.from({ length: 1000 }, (_, i) => [(i % 2) * 0.0005, i / 1000]);
  const fitted = thinSegments([wiggly, wiggly.slice(0, 2)], 100);
  assert.ok(fitted[0].length + fitted[1].length <= 100);
  assert.deepEqual([fitted[0][0], fitted[0].at(-1)], [wiggly[0], wiggly.at(-1)]);
  assert.deepEqual(fitted[1], wiggly.slice(0, 2));
});

test('timedTrack rounds drawn routes to about a metre', () => {
  const { track } = timedTrack([{ time: 0 }, { time: 10 }], [[[22.1234567, 88.7654321], [22.2, 88.8]]]);
  assert.deepEqual(track[0], [22.12346, 88.76543]);
});

describe('pauseForHiddenParts', () => {
  // A straight road from (0, 0) to (0, 1), four points along it.
  const road = [[[0, 0], [0, 0.25], [0, 0.5], [0, 0.75], [0, 1]]];
  const ride = (points) => timedTrack(points, road);
  const two = [{ time: 0, lat: 0, lng: 0 }, { time: 100, lat: 0, lng: 1 }];
  const lngs = (route) => route.track.map((p) => p[1]);
  // How far east the marker is at video time t (as the website works it out).
  const eastAt = (route, t) => {
    const { track, trackTimes } = route;
    let i = trackTimes.findLastIndex((time) => time <= t);
    if (i === track.length - 1) return track[i][1];
    const span = trackTimes[i + 1] - trackTimes[i];
    const f = span > 0 ? (t - trackTimes[i]) / span : 0;
    return track[i][1] + (track[i + 1][1] - track[i][1]) * f;
  };
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`);
  const inOrder = (times) => assert.ok(times.every((t, i) => i === 0 || t >= times[i - 1]), times.join(','));

  test('a drone shot between two places: the marker waits where it was, then rides on, arriving on time', () => {
    const paused = pauseForHiddenParts(ride(two), two, [{ start: 30, end: 50, reason: 'montage' }]);
    assert.deepEqual(paused.trackTimes, [0, 20, 30, 50, 60, 80, 100]);
    assert.deepEqual(lngs(paused), [0, 0.25, 0.375, 0.375, 0.5, 0.75, 1]);
    // Just before, during and after it: no jump.
    near(eastAt(paused, 30), 0.375);
    near(eastAt(paused, 40), 0.375);
    near(eastAt(paused, 50), 0.375);
    assert.ok(eastAt(paused, 51) > 0.375);
  });

  test('hidden parts right at a place, or across one, wait there', () => {
    const three = [two[0], two[1], { time: 200, lat: 0, lng: 2 }];
    const route = timedTrack(three, [road[0], [[0, 1], [0, 1.5], [0, 2]]]);
    const paused = pauseForHiddenParts(route, three, [
      { start: 0, end: 20 }, // at the very start of the ride
      { start: 90, end: 110 }, // across the second place
    ]);
    inOrder(paused.trackTimes);
    near(eastAt(paused, 10), 0);
    near(eastAt(paused, 95), 1);
    near(eastAt(paused, 100), 1);
    near(eastAt(paused, 105), 1);
    near(eastAt(paused, 200), 2);
  });

  test('no hidden parts, ones outside the ride, and a stretch that is all hidden leave the times as they were', () => {
    const route = ride(two);
    assert.deepEqual(pauseForHiddenParts(route, two, []), route);
    assert.deepEqual(pauseForHiddenParts(route, two, [{ start: 150, end: 160 }]).trackTimes, route.trackTimes);
    assert.deepEqual(pauseForHiddenParts(route, two, [{ start: 0, end: 100 }]).trackTimes, route.trackTimes);
  });

  test('after a stop, a drone shot still pauses the ride', () => {
    const stop = [{ ...two[0], stayUntil: 20 }, two[1]];
    const paused = pauseForHiddenParts(ride(stop), stop, [{ start: 50, end: 60 }]);
    inOrder(paused.trackTimes);
    near(eastAt(paused, 15), 0);
    near(eastAt(paused, 55), eastAt(paused, 50));
    near(eastAt(paused, 100), 1);
  });

  test('heights come along, including at the waiting point', () => {
    const route = { ...ride(two), trackElevations: [100, 200, 300, 400, 500] };
    const paused = pauseForHiddenParts(route, two, [{ start: 30, end: 50 }]);
    assert.deepEqual(paused.trackElevations, [100, 200, 250, 250, 300, 400, 500]);
  });
});
