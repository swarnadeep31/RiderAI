import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { processNextJob } from '../src/jobs/worker.js';
import { Job } from '../src/models/Job.js';
import { GeminiError } from '../src/services/gemini.js';
import { app, signedUpAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

let alice;
let trailId;
beforeEach(async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.AI_RETRY_DELAYS = '0,0';
  process.env.AI_JOBS_PER_USER_PER_DAY = '3';
  process.env.AI_MONTHLY_BUDGET_USD = '5';
  alice = await signedUpAgent('alice');
  const res = await alice.post('/api/trails').send({ title: 'Kolkata to Dhanbad', youtubeUrl: 'https://youtu.be/aBcD3fGh1_-' });
  trailId = res.body._id;
});
afterEach(() => delete process.env.GEMINI_API_KEY);

// Fake outside services: what Gemini "found", and where those places are.
const geminiAnswer = {
  places: [
    { time: '1:30', name: 'Howrah', region: 'West Bengal', presence: 'here', evidence: 'sign', quote: 'Howrah station', confidence: 0.9 },
    { time: '9:00', stay_until: '11:00', name: 'Durgapur', presence: 'here', evidence: 'speech', quote: 'chai break in Durgapur', confidence: 0.85 },
    { time: '12:00', name: 'Leh', presence: 'mentioned', evidence: 'speech', quote: 'one day we will reach Leh', confidence: 0.8 },
    { time: '16:00', name: 'Asansol', presence: 'here', evidence: 'milestone', confidence: 0.7 },
  ],
  hidden_ranges: [{ start: '0:00', end: '1:30', reason: 'intro' }],
};
const COORDS = { Howrah: [22.59, 88.31], Durgapur: [23.52, 87.31], Leh: [34.15, 77.58], Asansol: [23.68, 86.98] };

function fakeServices({ extract } = {}) {
  const calls = { extract: 0 };
  return {
    calls,
    services: {
      checkVideo: async () => ({ ok: true, title: 'Kolkata to Dhanbad ride' }),
      extract:
        extract ??
        (async () => {
          calls.extract += 1;
          return { data: geminiAnswer, raw: JSON.stringify(geminiAnswer), usage: { promptTokenCount: 180000, candidatesTokenCount: 3000 }, model: 'gemini-3.5-flash-lite' };
        }),
      geocode: async (candidates) => {
        for (const c of candidates) {
          const [lat, lng] = COORDS[c.name];
          Object.assign(c, { lat, lng, label: `${c.name}, India` });
        }
        return candidates;
      },
    },
  };
}

const start = (agent = alice, body = {}) => agent.post(`/api/trails/${trailId}/ai-route`).send({ durationSec: 1800, ...body });

describe('AI route jobs', () => {
  test('start -> analyse in the background -> review -> accept -> a timed road route', async () => {
    const started = await start();
    assert.equal(started.status, 202, JSON.stringify(started.body));
    assert.equal(started.body.state, 'queued');

    const { services, calls } = fakeServices();
    await processNextJob(services);
    assert.equal(calls.extract, 1);

    const job = await alice.get(`/api/jobs/${started.body._id}`);
    assert.equal(job.body.state, 'needs_review');
    assert.equal(job.body.videoTitle, 'Kolkata to Dhanbad ride');
    assert.ok(Math.abs(job.body.costUsd - 0.0615) < 1e-9);
    const { candidates, hiddenRanges } = job.body.result;
    assert.deepEqual(candidates.map((c) => [c.name, c.time, c.checked]), [
      ['Howrah', 90, true],
      ['Durgapur', 540, true],
      ['Leh', 720, false], // only mentioned
      ['Asansol', 960, true],
    ]);
    assert.deepEqual(hiddenRanges, [{ start: 0, end: 90, reason: 'intro' }]);

    // The owner accepts the ticked places (as edited in review).
    const accepted = await alice.post(`/api/trails/${trailId}/ai-route/accept`).send({
      jobId: job.body._id,
      places: candidates.filter((c) => c.checked),
      hiddenRanges,
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const trail = accepted.body;
    assert.deepEqual(trail.points.map((p) => [p.name, p.origin, p.time, p.stayUntil ?? null]), [
      ['Howrah', 'ai', 90, null],
      ['Durgapur', 'ai', 540, 660],
      ['Asansol', 'ai', 960, null],
    ]);
    assert.equal(trail.points[0].quote, 'Howrah station');
    assert.equal(trail.routeSource, 'keypoints');
    assert.equal(trail.ai.model, 'gemini-3.5-flash-lite');
    assert.deepEqual(trail.hiddenRanges, [{ start: 0, end: 90, reason: 'intro' }]);
    // Straight lines here (no routing key in tests), timed by the video, waiting at Durgapur.
    assert.deepEqual(trail.trackTimes, [90, 540, 660, 960]);
    assert.match(trail.routeNotice, /ORS_API_KEY/);
    assert.equal((await alice.get(`/api/jobs/${job.body._id}`)).body.state, 'accepted');
  });

  test('accepting again replaces the AI places but keeps hand-made ones', async () => {
    await alice.post(`/api/trails/${trailId}/points`).send({ time: 30, name: 'My note', lat: 22.5, lng: 88.3 });
    const { body: job } = await start();
    await processNextJob(fakeServices().services);
    const { body: done } = await alice.get(`/api/jobs/${job._id}`);
    const places = done.result.candidates.filter((c) => c.checked);
    await alice.post(`/api/trails/${trailId}/ai-route/accept`).send({ jobId: job._id, places });
    const again = await alice.post(`/api/trails/${trailId}/ai-route/accept`).send({ jobId: job._id, places: places.slice(0, 2) });
    assert.deepEqual(again.body.points.map((p) => p.name), ['My note', 'Howrah', 'Durgapur']);
  });

  test('the same video analysed before is reused for free', async () => {
    const { body: first } = await start();
    const { services, calls } = fakeServices();
    await processNextJob(services);

    const second = await start();
    assert.equal(second.status, 201);
    assert.equal(second.body.state, 'needs_review');
    assert.equal(second.body.reused, true);
    assert.equal(second.body.costUsd, 0);
    assert.equal(second.body.result.candidates.length, 4);
    assert.equal(calls.extract, 1);
    assert.notEqual(second.body._id, first._id);

    const fresh = await start(alice, { fresh: true });
    assert.equal(fresh.status, 202);
  });

  test('the worker runs without warnings (it checks for jobs every 2 seconds)', async () => {
    const warnings = [];
    const onWarning = (warning) => warnings.push(warning.message);
    process.on('warning', onWarning);
    try {
      await start();
      await processNextJob(fakeServices().services);
      await processNextJob(fakeServices().services); // nothing left to do
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('warning', onWarning);
    }
    assert.deepEqual(warnings, []);
  });

  test('a job can be cancelled, and Gemini is not asked', async () => {
    const { body: job } = await start();
    const cancelled = await alice.post(`/api/jobs/${job._id}/cancel`);
    assert.equal(cancelled.body.state, 'cancelled');
    const { services, calls } = fakeServices();
    assert.equal(await processNextJob(services), null);
    assert.equal(calls.extract, 0);
  });

  test('failures are explained; retryable ones are retried first', async () => {
    let tries = 0;
    const flaky = fakeServices({
      extract: async () => {
        tries += 1;
        throw new GeminiError('Gemini is busy.', { retryable: true });
      },
    });
    const { body: job } = await start();
    await processNextJob(flaky.services);
    assert.equal(tries, 3); // the first try + 2 retries
    const failed = await alice.get(`/api/jobs/${job._id}`);
    assert.equal(failed.body.state, 'failed');
    assert.match(failed.body.error, /busy/);

    const privateVideo = fakeServices();
    privateVideo.services.checkVideo = async () => ({ ok: false, reason: 'This video is private.' });
    const { body: second } = await start(alice, { fresh: true });
    await processNextJob(privateVideo.services);
    assert.equal((await alice.get(`/api/jobs/${second._id}`)).body.error, 'This video is private.');
  });

  test('a job left by a stopped server is picked up again where it stopped', async () => {
    const { body: job } = await start();
    // Pretend a worker took it, got Gemini's answer, then the server died.
    await Job.updateOne(
      { _id: job._id },
      {
        state: 'running',
        stage: 'extract',
        lockedUntil: new Date(Date.now() - 1000),
        clips: [{ start: 0, end: 1800, status: 'done', answer: geminiAnswer, usage: { costUsd: 0.06 } }],
      },
    );
    const { services, calls } = fakeServices();
    await processNextJob(services);
    assert.equal(calls.extract, 0); // the saved answer is used, not paid for again
    assert.equal((await alice.get(`/api/jobs/${job._id}`)).body.state, 'needs_review');
  });
});

describe('AI route limits', () => {
  test('explains what is wrong', async () => {
    assert.match((await start(alice, { durationSec: 0 })).body.error, /length is missing/);
    assert.match((await start(alice, { durationSec: 4 * 3600 })).body.error, /longer than 3 hours/);

    await start();
    const twice = await start();
    assert.equal(twice.status, 409);

    const bob = await signedUpAgent('bob');
    assert.equal((await start(bob)).status, 403);
    assert.equal((await request(app).post(`/api/trails/${trailId}/ai-route`).send({ durationSec: 60 })).status, 401);

    delete process.env.GEMINI_API_KEY;
    const noKey = await start();
    assert.equal(noKey.status, 503);
    assert.match(noKey.body.error, /GEMINI_API_KEY/);
  });

  test('a daily limit per user and a monthly budget stop runaway bills', async () => {
    process.env.AI_JOBS_PER_USER_PER_DAY = '1';
    const { body: first } = await start();
    await alice.post(`/api/jobs/${first._id}/cancel`);
    const second = await start(alice, { fresh: true });
    assert.equal(second.status, 429);
    assert.match(second.body.error, /1 AI analyses a day/);

    process.env.AI_JOBS_PER_USER_PER_DAY = '10';
    await Job.updateOne({ _id: first._id }, { 'usage.costUsd': 5.01 });
    const overBudget = await start(alice, { fresh: true });
    assert.equal(overBudget.status, 429);
    assert.match(overBudget.body.error, /budget/);
  });

  test("trails with the rider's GPS route don't need the AI", async () => {
    const gpx = await alice.post('/api/trails').send({
      title: 'Recorded',
      youtubeUrl: 'https://youtu.be/aBcD3fGh1_-',
      track: [
        [22.5, 88.3],
        [22.6, 88.4],
      ],
    });
    const res = await alice.post(`/api/trails/${gpx.body._id}/ai-route`).send({ durationSec: 600 });
    assert.equal(res.status, 409);
  });

  test("only the job's owner can see or cancel it", async () => {
    const { body: job } = await start();
    const bob = await signedUpAgent('bob');
    assert.equal((await bob.get(`/api/jobs/${job._id}`)).status, 404);
    assert.equal((await bob.post(`/api/jobs/${job._id}/cancel`)).status, 404);
    assert.equal((await alice.get(`/api/trails/${trailId}/ai-route`)).body._id, job._id);
  });
});
