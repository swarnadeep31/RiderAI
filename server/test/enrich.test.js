import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { processNextJob } from '../src/jobs/worker.js';
import { Job } from '../src/models/Job.js';
import { Trail } from '../src/models/Trail.js';
import { signedUpAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

const youtubeUrl = 'https://youtu.be/aBcD3fGh1_-';
const track = [
  [32.24, 77.19],
  [32.3, 77.2],
  [32.37, 77.25],
];
const otherTrack = [
  [32.24, 77.19],
  [32.4, 77.3],
];

let alice;
beforeEach(async () => {
  process.env.ROUTE_ENRICH_DELAY_SEC = '0';
  delete process.env.ORS_API_KEY;
  alice = await signedUpAgent('alice');
});

const enrichJobs = (trailId) => Job.find({ type: 'route-enrich', trail: trailId }).sort({ createdAt: 1 }).lean();

describe('route versions and the route-enrich job', () => {
  test('a trail saved with a route gets version 1 and one job for it', async () => {
    const res = await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl, track });
    assert.equal(res.body.routeVersion, 1);
    const jobs = await enrichJobs(res.body._id);
    assert.deepEqual(jobs.map((j) => [j.routeVersion, j.state, j.stage]), [[1, 'queued', 'elevation']]);
  });

  test('a trail saved without a route gets no job', async () => {
    const res = await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl });
    assert.equal(res.body.routeVersion, 0);
    assert.equal((await enrichJobs(res.body._id)).length, 0);
  });

  test('a new route shape gets a new version, and the waiting job for the old one is cancelled', async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl, track });
    const changed = await alice.patch(`/api/trails/${trail._id}`).send({ track: otherTrack });
    assert.equal(changed.body.routeVersion, 2);
    const jobs = await enrichJobs(trail._id);
    assert.deepEqual(jobs.map((j) => [j.routeVersion, j.state]), [
      [1, 'cancelled'],
      [2, 'queued'],
    ]);
  });

  test('changes that keep the shape (title, the same route again) keep the version', async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl, track });
    await alice.patch(`/api/trails/${trail._id}`).send({ title: 'Better title', track });
    const again = await alice.patch(`/api/trails/${trail._id}`).send({ videoStartsAt: 30 });
    assert.equal(again.body.routeVersion, 1);
    assert.equal((await enrichJobs(trail._id)).length, 1);
  });

  test('routes drawn between key points get a new version when the line changes, not when only a time does', async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl });
    await alice.post(`/api/trails/${trail._id}/points`).send({ time: 0, name: 'A', lat: 32.24, lng: 77.19 });
    const { body: second } = await alice.post(`/api/trails/${trail._id}/points`).send({ time: 600, name: 'B', lat: 32.3, lng: 77.2 });
    const drawn = await alice.post(`/api/trails/${trail._id}/route`).send({ style: 'straight' });
    assert.equal(drawn.body.routeVersion, 1);

    const pointB = second.points.find((p) => p.name === 'B');
    const retimed = await alice.patch(`/api/trails/${trail._id}/points/${pointB._id}`).send({ time: 900 });
    assert.equal(retimed.body.routeVersion, 1, 'a new time keeps the shape');
    const moved = await alice.patch(`/api/trails/${trail._id}/points/${pointB._id}`).send({ lat: 32.31 });
    assert.equal(moved.body.routeVersion, 2);
  });

  test('the job runs its stages and finishes', async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl, track });
    await processNextJob();
    const [job] = await enrichJobs(trail._id);
    assert.equal(job.state, 'done');
    assert.equal(job.stage, 'stats');
  });

  test('a job whose route changed before it ran stops without doing anything', async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl, track });
    // The route changes behind the queued job's back (e.g. a second server saved it).
    await Trail.updateOne({ _id: trail._id }, { routeVersion: 5 });
    await processNextJob();
    const [job] = await enrichJobs(trail._id);
    assert.equal(job.state, 'cancelled');
    assert.match(job.error, /route changed/);
  });

  test('waits a little after a change, so a burst of edits is worked on once', async () => {
    process.env.ROUTE_ENRICH_DELAY_SEC = '60';
    await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl, track });
    assert.equal(await processNextJob(), null);
  });

  test('deleting a trail cancels its waiting job', async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl, track });
    await alice.delete(`/api/trails/${trail._id}`);
    const [job] = await enrichJobs(trail._id);
    assert.equal(job.state, 'cancelled');
  });

  test("route jobs don't count towards the daily AI limit", async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.AI_JOBS_PER_USER_PER_DAY = '1';
    try {
      for (let i = 0; i < 3; i++) await alice.post('/api/trails').send({ title: `Ride ${i}`, youtubeUrl, track });
      const { body: trail } = await alice.post('/api/trails').send({ title: 'Vlog', youtubeUrl });
      const started = await alice.post(`/api/trails/${trail._id}/ai-route`).send({ durationSec: 600 });
      assert.equal(started.status, 202, JSON.stringify(started.body));
      const latest = await alice.get(`/api/trails/${trail._id}/ai-route`);
      assert.equal(latest.body._id, started.body._id);
    } finally {
      delete process.env.GEMINI_API_KEY;
      delete process.env.AI_JOBS_PER_USER_PER_DAY;
    }
  });
});

describe('heights for the elevation chart', () => {
  // A 20 km climb from 2,000 m to 3,000 m, recorded every 100 m.
  const climbTrack = Array.from({ length: 201 }, (_, i) => [32.2 + i * 0.0009, 77.19]);
  const climbHeights = climbTrack.map((_, i) => 2000 + i * 5);

  test('a GPX route with heights gets its profile when saved', async () => {
    const res = await alice.post('/api/trails').send({ title: 'Climb', youtubeUrl, track: climbTrack, trackElevations: climbHeights });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const profile = res.body.elevationProfile;
    assert.equal(profile.source, 'gpx');
    assert.equal(profile.routeVersion, 1);
    assert.equal(profile.d.length, 201);
    // GPS heights are smoothed, which shaves a few metres off a peak at the very end.
    assert.ok(Math.abs(profile.summary.highestM - 3000) <= 5, `highest ${profile.summary.highestM}`);
    // The dead band leaves out the last climb under 10 m, and smoothing softens the ends.
    assert.ok(Math.abs(profile.summary.ascentM - 1000) <= 25, `climb ${profile.summary.ascentM}`);
    // The list of trails leaves the profile out, like the route.
    const list = await alice.get('/api/trails');
    assert.equal(list.body[0].elevationProfile, undefined);
  });

  test('heights must match the route point for point', async () => {
    const res = await alice.post('/api/trails').send({ title: 'Climb', youtubeUrl, track: climbTrack, trackElevations: [1, 2, 3] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /one number \(or null\) per route point/);
  });

  test('a GPX route with too many heights missing gets none, until the job finds some', async () => {
    const patchy = climbHeights.map((h, i) => (i % 3 === 0 ? h : null));
    const res = await alice.post('/api/trails').send({ title: 'Climb', youtubeUrl, track: climbTrack, trackElevations: patchy });
    assert.equal(res.body.elevationProfile, undefined);
  });

  test("a straight-line route gets heights from OpenRouteService's elevation service in the job", async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Ride', youtubeUrl });
    await alice.post(`/api/trails/${trail._id}/points`).send({ time: 0, name: 'Foot', lat: 32.2, lng: 77.19 });
    await alice.post(`/api/trails/${trail._id}/points`).send({ time: 600, name: 'Top', lat: 32.38, lng: 77.19 });
    const drawn = await alice.post(`/api/trails/${trail._id}/route`).send({ style: 'straight' });
    assert.equal(drawn.body.elevationProfile, undefined);

    const asked = [];
    await processNextJob({
      heightsAvailable: () => true,
      lineHeights: async (locations) => {
        asked.push(locations);
        // Up 1,000 m from the foot to the top.
        return locations.map(([lat]) => 2000 + ((lat - 32.2) / 0.18) * 1000);
      },
    });
    assert.equal(asked.length, 1);
    assert.equal(asked[0].length, 2, 'evenly spaced points, at most one per route point');

    const { body: after } = await alice.get(`/api/trails/${trail._id}`);
    assert.equal(after.elevationProfile.source, 'dem');
    assert.equal(after.elevationProfile.routeVersion, after.routeVersion);
    assert.equal(after.elevationProfile.summary.highestM, 3000);
  });

  test('the job leaves a route that already has heights alone, and copes without a key', async () => {
    await alice.post('/api/trails').send({ title: 'Climb', youtubeUrl, track: climbTrack, trackElevations: climbHeights });
    let asked = 0;
    await processNextJob({ heightsAvailable: () => true, lineHeights: async () => (asked++, []) });
    assert.equal(asked, 0);

    const { body: plain } = await alice.post('/api/trails').send({ title: 'No heights', youtubeUrl, track });
    await processNextJob({ heightsAvailable: () => false, lineHeights: async () => (asked++, []) });
    assert.equal(asked, 0);
    assert.equal((await alice.get(`/api/trails/${plain._id}`)).body.elevationProfile, undefined);
  });

  test('if the elevation service fails, the job carries on without heights', async () => {
    const { body: plain } = await alice.post('/api/trails').send({ title: 'No heights', youtubeUrl, track });
    await processNextJob({ heightsAvailable: () => true, lineHeights: async () => { throw new Error('quota used up'); } });
    const [job] = await enrichJobs(plain._id);
    assert.equal(job.state, 'done');
  });
});
