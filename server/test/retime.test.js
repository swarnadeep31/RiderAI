import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import mongoose from 'mongoose';
import { ROUTE_TIMING, Trail } from '../src/models/Trail.js';
import { retimeDrawnRoutes } from '../src/routeExtras/retime.js';
import { useTestDatabase } from './helpers.js';

describe('drawn routes from before drone shots paused the rider', () => {
  useTestDatabase();

  // Saved the old way: the 100 seconds between the two places spread over the whole road, drone shot included.
  const oldRoute = (fields = {}) =>
    Trail.create({
      owner: new mongoose.Types.ObjectId(),
      title: 'Old ride',
      youtubeId: 'aBcD3fGh1_-',
      routeSource: 'keypoints',
      routeVersion: 3,
      points: [
        { name: 'Start', time: 0, lat: 0, lng: 0 },
        { name: 'End', time: 100, lat: 0, lng: 1 },
      ],
      track: [[0, 0], [0, 0.25], [0, 0.5], [0, 0.75], [0, 1]],
      trackTimes: [0, 25, 50, 75, 100],
      hiddenRanges: [{ start: 30, end: 50, reason: 'montage' }],
      ...fields,
    });

  test('get their times re-spread once, keeping their route version', async () => {
    const old = await oldRoute();
    const plain = await oldRoute({ hiddenRanges: [] });
    assert.equal(await retimeDrawnRoutes(), 1);

    const after = await Trail.findById(old._id).lean();
    assert.deepEqual(after.trackTimes, [0, 20, 30, 50, 60, 80, 100]);
    assert.deepEqual(after.track.map((p) => p[1]), [0, 0.25, 0.375, 0.375, 0.5, 0.75, 1]);
    assert.equal(after.routeVersion, 3, 'the road is the same, so heights and fuel stops still fit');
    assert.equal(after.timing, ROUTE_TIMING);
    // One without hidden parts is only marked.
    const untouched = await Trail.findById(plain._id).lean();
    assert.deepEqual(untouched.trackTimes, [0, 25, 50, 75, 100]);
    assert.equal(untouched.timing, ROUTE_TIMING);

    // Never twice.
    assert.equal(await retimeDrawnRoutes(), 0);
    assert.deepEqual((await Trail.findById(old._id).lean()).trackTimes, after.trackTimes);
  });

  test('GPS recordings are left alone', async () => {
    const gpx = await oldRoute({ routeSource: 'gpx' });
    assert.equal(await retimeDrawnRoutes(), 0);
    assert.deepEqual((await Trail.findById(gpx._id).lean()).trackTimes, [0, 25, 50, 75, 100]);
  });
});
