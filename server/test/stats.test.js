import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { computeStats, nearestPointName, restPeriods, ridingDays } from '../src/routeExtras/stats.js';
import { cumulativeDistances } from '../src/utils/geo.js';
import { signedUpAgent, useTestDatabase } from './helpers.js';

const HOUR = 3600;
// A ride north along a meridian: one point every 0.005 degrees (about 556 m), one a minute.
const ride = (fromLat, minutes, startSec) =>
  Array.from({ length: minutes }, (_, i) => ({ location: [fromLat + i * 0.005, 77], time: startSec + i * 60 }));
const split = (points) => ({ track: points.map((p) => p.location), trackTimes: points.map((p) => p.time) });

describe('restPeriods', () => {
  test('a single-day ride has none', () => {
    const { track, trackTimes } = split(ride(32, 300, 0));
    assert.deepEqual(restPeriods(track, trackTimes), []);
  });

  test('a recording paused overnight is a rest', () => {
    const day1 = ride(32, 120, 0);
    const day2 = ride(32 + 119 * 0.005, 120, 20 * HOUR); // starts again where it stopped, 18 hours later
    const { track, trackTimes } = split([...day1, ...day2]);
    const rests = restPeriods(track, trackTimes);
    assert.equal(rests.length, 1);
    // It starts at the first point within 1 km of where the night was spent.
    assert.ok(rests[0].index >= 118 && rests[0].index <= 119, `rest at ${rests[0].index}`);
  });

  test('a phone left recording at the hotel is a rest', () => {
    const day1 = ride(32, 120, 0);
    const end = day1.at(-1);
    // 10 hours of points shuffling around the hotel car park.
    const night = Array.from({ length: 600 }, (_, i) => ({ location: [end.location[0] + (i % 5) * 0.0002, 77], time: end.time + 60 + i * 60 }));
    const day2 = ride(end.location[0], 60, night.at(-1).time + 60);
    const { track, trackTimes } = split([...day1, ...night, ...day2]);
    assert.equal(restPeriods(track, trackTimes).length, 1);
  });

  test('a long lunch under 6 hours is not', () => {
    const before = ride(32, 60, 0);
    const end = before.at(-1);
    const lunch = Array.from({ length: 300 }, (_, i) => ({ location: end.location, time: end.time + 60 + i * 60 })); // 5 hours
    const after = ride(end.location[0], 60, lunch.at(-1).time + 60);
    const { track, trackTimes } = split([...before, ...lunch, ...after]);
    assert.deepEqual(restPeriods(track, trackTimes), []);
  });
});

test('nearestPointName names a place after the closest key point within 10 km', () => {
  const points = [
    { name: 'Taglang La', lat: 33.507, lng: 77.77 },
    { name: 'Pang', lat: 33.13, lng: 77.78 },
  ];
  assert.equal(nearestPointName(points, [33.51, 77.765]), 'Taglang La');
  assert.equal(nearestPointName(points, [33.3, 77.78]), null, 'Pang is about 19 km away');
});

describe('ridingDays', () => {
  const two = split([...ride(32, 120, 0), ...ride(32 + 119 * 0.005, 120, 20 * HOUR)]);
  const gpsTrail = { ...two, routeSource: 'gpx', points: [{ name: 'Jispa', lat: 32.6, lng: 77.0 }] };

  test("the owner's number wins", () => {
    assert.deepEqual(ridingDays({ ...gpsTrail, daysOverride: 4 }, cumulativeDistances(two.track)), { days: 4, daysSource: 'owner', nights: [] });
  });

  test('a timed GPS route counts its nights, and places them', () => {
    const { days, daysSource, nights } = ridingDays(gpsTrail, cumulativeDistances(two.track));
    assert.equal(days, 2);
    assert.equal(daysSource, 'gps');
    assert.equal(nights.length, 1);
    assert.equal(nights[0].name, 'Jispa');
    assert.ok(Math.abs(nights[0].alongM - 119 * 556) < 1000, `night at ${nights[0].alongM} m`);
  });

  test('a drawn route counts the key points marked as overnight stops', () => {
    const drawn = {
      routeSource: 'keypoints',
      track: [[32, 77], [32.5, 77], [33, 77]],
      trackTimes: [0, 600, 1200],
      points: [{ name: 'Sarchu', time: 600, lat: 32.5, lng: 77, stopKind: 'overnight' }, { name: 'Tea', time: 300, lat: 32.2, lng: 77, stopKind: 'break' }],
    };
    const { days, daysSource, nights } = ridingDays(drawn, cumulativeDistances(drawn.track));
    assert.equal(days, 2);
    assert.equal(daysSource, 'stops');
    assert.equal(nights[0].name, 'Sarchu');
  });

  test('otherwise unknown, not a guess', () => {
    const drawn = { routeSource: 'keypoints', track: [[32, 77], [33, 77]], trackTimes: [0, 600], points: [] };
    assert.equal(ridingDays(drawn, cumulativeDistances(drawn.track)).days, undefined);
  });
});

describe('computeStats', () => {
  test('distance, heights and the highest point named after a key point', () => {
    const trail = {
      routeVersion: 3,
      routeSource: 'keypoints',
      track: [[33.0, 77.77], [33.507, 77.77], [33.9, 77.77]],
      trackTimes: [0, 1000, 2000],
      points: [{ name: 'Taglang La', lat: 33.51, lng: 77.77 }],
      elevationProfile: { routeVersion: 3, summary: { highestM: 5328, highestAlongM: 56376, ascentM: 2100, descentM: 1900 } },
    };
    const stats = computeStats(trail);
    assert.equal(stats.routeVersion, 3);
    assert.equal(stats.approximate, true);
    assert.ok(Math.abs(stats.distanceM - 100074) < 50, `distance ${stats.distanceM}`);
    assert.equal(stats.highestM, 5328);
    assert.equal(stats.highestName, 'Taglang La');
    assert.equal(stats.ascentM, 2100);
  });

  test('heights for another route version are not used', () => {
    const stats = computeStats({ routeVersion: 2, track: [[0, 0], [0, 1]], trackTimes: [], points: [], elevationProfile: { routeVersion: 1, summary: { highestM: 9 } } });
    assert.equal(stats.highestM, undefined);
  });

  test('a trail without a route has no numbers', () => {
    const stats = computeStats({ routeVersion: 0, track: [], points: [] });
    assert.equal(stats.distanceM, undefined);
    assert.equal(stats.days, undefined);
  });
});

describe('stats through the API', () => {
  useTestDatabase();
  const youtubeUrl = 'https://youtu.be/aBcD3fGh1_-';
  let alice;
  beforeEach(async () => {
    delete process.env.ORS_API_KEY;
    alice = await signedUpAgent('alice');
  });

  test('a two-day GPS ride shows 2 days with no input, and the owner can change it', async () => {
    const two = split([...ride(32, 120, 0), ...ride(32 + 119 * 0.005, 120, 20 * HOUR)]);
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Two days', youtubeUrl, ...two });
    assert.equal(trail.stats.days, 2);
    assert.equal(trail.stats.daysSource, 'gps');
    assert.ok(trail.stats.distanceM > 130000);

    const changed = await alice.patch(`/api/trails/${trail._id}`).send({ daysOverride: 3 });
    assert.deepEqual([changed.body.stats.days, changed.body.stats.daysSource], [3, 'owner']);
    const cleared = await alice.patch(`/api/trails/${trail._id}`).send({ daysOverride: null });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.equal(cleared.body.stats.days, 2);
    const bad = await alice.patch(`/api/trails/${trail._id}`).send({ daysOverride: 0 });
    assert.equal(bad.status, 400);

    // The list of trails has them for the cards.
    const { body: list } = await alice.get('/api/trails');
    assert.equal(list[0].stats.days, 2);
  });

  test('a drawn route shows days once a key point is marked as an overnight stop', async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Drawn', youtubeUrl });
    await alice.post(`/api/trails/${trail._id}/points`).send({ time: 0, name: 'Manali', lat: 32.24, lng: 77.19 });
    const { body: withSarchu } = await alice.post(`/api/trails/${trail._id}/points`).send({ time: 600, name: 'Sarchu', lat: 32.9, lng: 77.6 });
    await alice.post(`/api/trails/${trail._id}/points`).send({ time: 1200, name: 'Leh', lat: 34.15, lng: 77.58 });
    const drawn = await alice.post(`/api/trails/${trail._id}/route`).send({ style: 'straight' });
    assert.equal(drawn.body.stats.days, undefined);
    assert.equal(drawn.body.stats.approximate, true);

    const sarchu = withSarchu.points.find((p) => p.name === 'Sarchu');
    const marked = await alice.patch(`/api/trails/${trail._id}/points/${sarchu._id}`).send({ stopKind: 'overnight' });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.equal(marked.body.stats.days, 2);
    assert.equal(marked.body.stats.nights[0].name, 'Sarchu');
    assert.equal(marked.body.routeVersion, drawn.body.routeVersion, 'marking a night keeps the route');

    const wrong = await alice.patch(`/api/trails/${trail._id}/points/${sarchu._id}`).send({ stopKind: 'nap' });
    assert.equal(wrong.status, 400);
  });
});
