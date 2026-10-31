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
    { time: '9:00', stay_until: '11:00', stay_kind: 'overnight', name: 'Durgapur', presence: 'here', evidence: 'speech', quote: 'night in Durgapur', confidence: 0.85 },
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
    // Which model answered (a backup, when the main one had reached its limit).
    assert.deepEqual(job.body.modelsUsed, ['gemini-3.5-flash-lite']);
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
    // A night's stay found by the AI counts towards the riding days.
    assert.equal(trail.points[1].stopKind, 'overnight');
    assert.equal(trail.stats.days, 2);
    assert.equal(trail.routeSource, 'keypoints');
    assert.equal(trail.ai.model, 'gemini-3.5-flash-lite');
    assert.deepEqual(trail.hiddenRanges, [{ start: 0, end: 90, reason: 'intro' }]);
    // Straight lines here (no routing key in tests), timed by the video, waiting at Durgapur.
    assert.deepEqual(trail.trackTimes, [90, 540, 660, 960]);
    assert.match(trail.routeNotice, /ORS_API_KEY/);
    assert.equal((await alice.get(`/api/jobs/${job.body._id}`)).body.state, 'accepted');
  });

  test("with the trip's start and end from the title: they're pinned on, Gemini is told, and places are looked for between them", async () => {
    const kolkata = { name: 'Kolkata', label: 'Kolkata, West Bengal, India', lat: 22.5726, lng: 88.3639 };
    const dhanbad = { name: 'Dhanbad', label: 'Dhanbad, Jharkhand, India', lat: 23.7957, lng: 86.4304 };
    const set = await alice.patch(`/api/trails/${trailId}`).send({ videoTitle: 'Kolkata to Dhanbad | EP1', startPlace: kolkata, endPlace: dhanbad });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    const started = await start();

    const told = [];
    const lookedUp = [];
    const { services } = fakeServices({
      extract: async (options) => {
        told.push(options.trip);
        const data = { ...geminiAnswer, start_time: '2:00' };
        return { data, raw: JSON.stringify(data), usage: {}, model: 'gemini-3.5-flash-lite' };
      },
    });
    const geocode = services.geocode;
    services.geocode = async (candidates, options) => {
      lookedUp.push(options);
      return geocode(candidates.filter((c) => !c.anchor));
    };
    await processNextJob(services);

    assert.deepEqual(told, [{ title: 'Kolkata to Dhanbad | EP1', start: kolkata, end: dhanbad }]);
    assert.deepEqual(lookedUp[0].start, kolkata);
    assert.ok(lookedUp[0].area.west < 86.4304 && lookedUp[0].area.east > 88.3639);

    const { body: job } = await alice.get(`/api/jobs/${started.body._id}`);
    assert.deepEqual(job.trip, { start: kolkata, end: dhanbad });
    assert.deepEqual(job.result.candidates.map((c) => [c.name, c.time, c.checked, c.anchor ?? null]), [
      // Howrah came before the ride set off at 2:00.
      ['Howrah', 90, false, null],
      ['Kolkata', 120, true, 'start'],
      ['Durgapur', 540, true, null],
      ['Leh', 720, false, null],
      ['Asansol', 960, true, null],
      ['Dhanbad', 1800, true, 'end'],
    ]);
    assert.deepEqual(job.result.hiddenRanges, [{ start: 0, end: 120, reason: 'intro' }]);

    const accepted = await alice.post(`/api/trails/${trailId}/ai-route/accept`).send({
      jobId: job._id,
      places: job.result.candidates.filter((c) => c.checked),
      hiddenRanges: job.result.hiddenRanges,
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.deepEqual(accepted.body.points.map((p) => [p.name, p.time]), [['Kolkata', 120], ['Durgapur', 540], ['Asansol', 960], ['Dhanbad', 1800]]);
    assert.deepEqual([accepted.body.trackTimes[0], accepted.body.trackTimes.at(-1)], [120, 1800]);

    // Other ends are another analysis, not a reuse of this one.
    await alice.patch(`/api/trails/${trailId}`).send({ endPlace: { ...dhanbad, name: 'Asansol', lat: 23.68, lng: 86.98 } });
    assert.equal((await start()).status, 202);
  });

  test("from the video's transcript: Gemini reads only the words, with their times, and nothing is watched", async () => {
    const pasted = ['0:00', 'welcome to the channel', '1:30', 'we are at Howrah station', '9:00', 'night in Durgapur', '16:00', 'Asansol now'].join('\n');
    const started = await alice.post(`/api/trails/${trailId}/ai-route/transcript`).send({ text: pasted, durationSec: 1800 });
    assert.equal(started.status, 202, JSON.stringify(started.body));
    assert.equal(started.body.source, 'transcript');

    const read = [];
    const { services } = fakeServices({
      extract: async (options) => {
        read.push(options);
        return { data: geminiAnswer, raw: JSON.stringify(geminiAnswer), usage: { promptTokenCount: 900, candidatesTokenCount: 300 }, model: 'gemini-3.5-flash-lite' };
      },
    });
    services.checkVideo = async () => assert.fail("a transcript doesn't need the video");
    await processNextJob(services);

    assert.equal(read.length, 1);
    assert.equal(read[0].transcript, '[0:00] welcome to the channel\n[1:30] we are at Howrah station\n[9:00] night in Durgapur\n[16:00] Asansol now');
    assert.equal(read[0].youtubeId, undefined);
    const { body: job } = await alice.get(`/api/jobs/${started.body._id}`);
    assert.equal(job.state, 'needs_review');
    assert.deepEqual(job.result.candidates.map((c) => c.name), ['Howrah', 'Durgapur', 'Leh', 'Asansol']);
    assert.equal(job.transcript, undefined, "the browser doesn't get the transcript back");

    // The same transcript again (copied a little differently) is free.
    const again = await alice.post(`/api/trails/${trailId}/ai-route/transcript`).send({ text: `${pasted}\n`, durationSec: 1800 });
    assert.equal(again.status, 201);
    assert.equal(again.body.reused, true);
  });

  test('a transcript needs its times, and must be of this video', async () => {
    const send = (text, durationSec = 1800) => alice.post(`/api/trails/${trailId}/ai-route/transcript`).send({ text, durationSec });
    const noTimes = await send('we rode from Kolkata to Dhanbad');
    assert.equal(noTimes.status, 400);
    assert.match(noTimes.body.error, /no times/);
    const longer = await send('0:00\nhello\n45:00\nthe end');
    assert.equal(longer.status, 400);
    assert.match(longer.body.error, /runs to 45:00, but the video is 30:00 long/);
    assert.equal((await send('')).status, 400);
    assert.equal((await send('x'.repeat(1_000_001))).status, 413);
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
    // Each turn is one try; with no wait between retries, the job is due again a moment later.
    for (let turn = 0; turn < 10 && (await Job.findById(job._id)).state !== 'failed'; turn++) {
      await processNextJob(flaky.services);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
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

  test('a busy Gemini puts the analysis back in the queue, and the worker gets on with other work', async () => {
    process.env.AI_RETRY_DELAYS = '120,600';
    let tries = 0;
    const busy = fakeServices({
      extract: async () => {
        tries += 1;
        throw new GeminiError('Gemini is busy.', { retryable: true });
      },
    });
    const { body: job } = await start();
    const startedAt = Date.now();
    await processNextJob(busy.services);
    assert.equal(tries, 1);
    assert.ok(Date.now() - startedAt < 5000, "the worker doesn't wait with it");

    // The page shows when it tries again, and why.
    const waiting = (await alice.get(`/api/jobs/${job._id}`)).body;
    assert.equal(waiting.state, 'queued');
    assert.match(waiting.retryReason, /busy/);
    const waitSec = (new Date(waiting.retryAt) - startedAt) / 1000;
    assert.ok(waitSec >= 119 && waitSec < 130, `waits ${waitSec} s`);
    // Not due yet: nothing to do. (A stop is counted only for real stops.)
    assert.equal(await processNextJob(busy.services), null);
    assert.equal((await Job.findById(job._id)).attempts, 0);

    // Once due, it carries on where it was: the second try.
    await Job.updateOne({ _id: job._id }, { lockedUntil: new Date(Date.now() - 1000) });
    await processNextJob(busy.services);
    assert.equal(tries, 2);
    const again = await Job.findById(job._id);
    assert.equal(again.clips[0].attempts, 2);
    assert.ok(again.retryAt - Date.now() > 590 * 1000, 'then waits the next delay');
  });

  test('when every model is resting, the retry waits until the first one is back', async () => {
    const backAt = new Date(Date.now() + 60 * 60 * 1000);
    const resting = fakeServices({
      extract: async () => {
        throw new GeminiError('Every AI model has reached its limit.', { retryable: true, retryAt: backAt });
      },
    });
    const { body: job } = await start();
    await processNextJob(resting.services);
    const { retryAt } = (await alice.get(`/api/jobs/${job._id}`)).body;
    assert.ok(Math.abs(new Date(retryAt) - backAt) < 2000, `retries at ${retryAt}`);
  });

  test("a line of work only takes its own jobs: route work doesn't wait behind AI analyses", async () => {
    const { body: job } = await start();
    const { services, calls } = fakeServices();
    assert.equal(await processNextJob(services, { types: ['route-enrich'] }), null);
    assert.equal(calls.extract, 0);
    assert.equal((await processNextJob(services, { types: ['ai-route'] }))._id.toString(), job._id);
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
