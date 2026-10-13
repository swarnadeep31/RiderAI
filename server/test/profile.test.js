import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildProfile, climb, fillHeights, MAX_PROFILE_POINTS, mean3, median5, resample } from '../src/routeExtras/profile.js';

describe('fillHeights', () => {
  const alongM = Array.from({ length: 10 }, (_, i) => i * 100);

  test('fills a gap, and copies the nearest height at the start', () => {
    const heights = [null, 100, 110, null, 130, 140, 150, 160, 170, 180];
    assert.deepEqual(fillHeights(alongM, heights), [100, 100, 110, 120, 130, 140, 150, 160, 170, 180]);
  });

  test('copies the nearest height at the end', () => {
    assert.deepEqual(fillHeights(alongM, [0, 10, 20, 30, 40, 50, 60, 70, null, null]).slice(-3), [70, 70, 70]);
  });

  test('gives up when more than 20% are missing', () => {
    assert.equal(fillHeights(alongM, [null, 100, 110, null, 130, 140, 150, 160, 170, null]), null);
  });

  test('interpolates by distance, not by count', () => {
    const uneven = [0, 100, 400, 500, 600, 700, 800, 900, 1000, 1100];
    const heights = [0, null, 400, 500, 600, 700, 800, 900, 1000, 1100];
    assert.equal(fillHeights(uneven, heights)[1], 100);
  });

  test('gives up with no heights at all', () => {
    assert.equal(fillHeights([0, 10], [null, null]), null);
    assert.equal(fillHeights([], []), null);
  });
});

test('median5 removes a spike, mean3 smooths', () => {
  assert.deepEqual(median5([10, 10, 90, 10, 10]), [10, 10, 10, 10, 10]);
  assert.deepEqual(mean3([0, 3, 6]), [1.5, 3, 4.5]);
});

describe('climb', () => {
  test('a flat road with GPS jitter climbs about nothing', () => {
    const jitter = Array.from({ length: 500 }, (_, i) => 1000 + 4 * Math.sin(i * 1.7) + (i % 3) * 2);
    const { ascentM, descentM } = climb(jitter);
    assert.ok(ascentM < 10, `climbed ${ascentM} m`);
    assert.ok(descentM < 10);
  });

  test('a clean 100 m ramp climbs 100 m', () => {
    const ramp = Array.from({ length: 101 }, (_, i) => 2000 + i);
    assert.deepEqual(climb(ramp), { ascentM: 100, descentM: 0 });
  });

  test('up and down both count', () => {
    assert.deepEqual(climb([0, 50, 20, 80, 0]), { ascentM: 110, descentM: 110 });
  });
});

test('resample spaces the samples evenly by distance', () => {
  const { d, e } = resample([0, 100, 300], [0, 10, 30], 4);
  assert.deepEqual(d, [0, 100, 200, 300]);
  assert.deepEqual(e, [0, 10, 20, 30]);
});

describe('buildProfile', () => {
  const along = Array.from({ length: 3000 }, (_, i) => i * 50);
  // Up 1,000 m and back down over 150 km.
  const heights = along.map((_, i) => 2000 + 1000 * Math.sin((Math.PI * i) / 2999));

  test('never has more than 1,000 samples, and rounds them', () => {
    const profile = buildProfile({ alongM: along, heights, source: 'ors' });
    assert.equal(profile.d.length, MAX_PROFILE_POINTS);
    assert.equal(profile.e.length, MAX_PROFILE_POINTS);
    assert.equal(profile.d[0], 0);
    assert.equal(profile.d.at(-1), along.at(-1));
    assert.ok(profile.d.every((v) => v % 10 === 0));
    assert.ok(profile.e.every(Number.isInteger));
  });

  test('the highest point and climb come from all the heights', () => {
    const spiky = [...heights];
    spiky[100] = 3500; // one short, sharp peak between two profile samples
    spiky[101] = 3500;
    spiky[102] = 3500;
    const profile = buildProfile({ alongM: along, heights: spiky, source: 'ors' });
    assert.equal(profile.summary.highestM, 3500);
    assert.equal(profile.summary.highestAlongM, 5000);
    assert.ok(Math.max(...profile.e) < 3500, 'the samples alone miss it');
  });

  test('GPS heights are smoothed, so a one-point spike disappears', () => {
    const flat = along.slice(0, 50).map(() => 1500);
    flat[20] = 1900;
    const profile = buildProfile({ alongM: along.slice(0, 50), heights: flat, source: 'gpx' });
    assert.equal(profile.summary.highestM, 1500);
    assert.equal(profile.summary.ascentM, 0);
  });

  test('is null without usable heights or distance', () => {
    assert.equal(buildProfile({ alongM: [0, 10, 20, 30, 40], heights: [null, null, 5, null, null], source: 'gpx' }), null);
    assert.equal(buildProfile({ alongM: [0, 0], heights: [1, 2], source: 'gpx' }), null);
  });
});
