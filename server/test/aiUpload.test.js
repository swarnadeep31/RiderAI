import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { removeOldUploads } from '../src/aiRoute/pipeline.js';
import { processNextJob } from '../src/jobs/worker.js';
import { Job } from '../src/models/Job.js';
import { hasFfmpeg } from '../src/services/videoFile.js';
import { signedUpAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

const ffmpeg = await hasFfmpeg();
const skip = ffmpeg ? false : 'FFmpeg is not installed';

let dir;
let ride;
let silent;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trailcast-upload-test-'));
  if (!ffmpeg) return;
  ride = join(dir, 'ride.mp4');
  silent = join(dir, 'silent.mp4');
  // A 4-second test video with a beep, and one without sound.
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=4', '-f', 'lavfi', '-i', 'sine=duration=4', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', ride]);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=4', '-c:v', 'libx264', silent]);
});
after(() => rm(dir, { recursive: true, force: true }));

let alice;
let trailId;
let uploads;
beforeEach(async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.AI_RETRY_DELAYS = '0,0';
  uploads = await mkdtemp(join(dir, 'uploads-'));
  process.env.AI_UPLOAD_DIR = uploads;
  alice = await signedUpAgent('alice');
  const res = await alice.post('/api/trails').send({ title: 'My ride', youtubeUrl: 'https://youtu.be/aBcD3fGh1_-' });
  trailId = res.body._id;
});
afterEach(() => {
  for (const name of ['GEMINI_API_KEY', 'AI_UPLOAD_DIR', 'AI_MAX_UPLOAD_MB']) delete process.env[name];
});

const upload = async (file, query = {}) =>
  alice
    .post(`/api/trails/${trailId}/ai-route/upload`)
    .query({ mode: 'sound', durationSec: 4, ...query })
    .set('Content-Type', 'video/mp4')
    .set('X-File-Name', encodeURIComponent('ride.mp4'))
    .send(await readFile(file));

// A fake for cutting, uploading and asking Gemini about one clip of the file.
function fakeUploadExtract(calls) {
  return async ({ job, clip }) => {
    calls.push({ mode: job.mediaMode, clip: { start: clip.start, end: clip.end }, fileThere: existsSync(job.uploadPath) });
    const data = { places: [{ time: '0:02', name: 'Manali', presence: 'here', evidence: 'speech', confidence: 0.9, quote: 'we are in Manali' }], hidden_ranges: [] };
    return { data, raw: JSON.stringify(data), usage: { promptTokenCount: 200, candidatesTokenCount: 50 }, model: 'gemini-3.5-flash-lite' };
  };
}

describe('analysing an uploaded video file', () => {
  test('sound only: saved, analysed from the file, then the file is deleted', { skip }, async () => {
    const res = await upload(ride);
    assert.equal(res.status, 202, JSON.stringify(res.body));
    assert.deepEqual([res.body.source, res.body.mediaMode, res.body.videoTitle], ['upload', 'sound', 'ride.mp4']);
    assert.equal((await readdir(uploads)).length, 1, 'the file waits on the server');

    const calls = [];
    await processNextJob({ extractFromUpload: fakeUploadExtract(calls), geocode: async (c) => c.forEach((p) => Object.assign(p, { lat: 32.24, lng: 77.19 })) });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].mode, 'sound');
    assert.equal(calls[0].fileThere, true);

    const { body: job } = await alice.get(`/api/jobs/${res.body._id}`);
    assert.equal(job.state, 'needs_review');
    assert.deepEqual(job.result.candidates.map((c) => [c.name, c.time]), [['Manali', 2]]);
    assert.deepEqual(await readdir(uploads), [], 'and is deleted when the analysis ends');
  });

  test('the same file analysed the same way again is free', { skip }, async () => {
    const first = await upload(ride);
    await processNextJob({ extractFromUpload: fakeUploadExtract([]), geocode: async (c) => c });
    const again = await upload(ride);
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.equal(again.body.reused, true);
    assert.notEqual(again.body._id, first.body._id);
    assert.deepEqual(await readdir(uploads), []);
    // A different way of sending it is a new analysis.
    assert.equal((await upload(ride, { mode: 'picture' })).status, 202);
  });

  test('it must be the same video as on YouTube, so the times line up', { skip }, async () => {
    const res = await upload(ride, { durationSec: 600 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /This file is 0:04 long, but the YouTube video is 10:00/);
    assert.deepEqual(await readdir(uploads), [], 'a refused file is deleted');
  });

  test('says what is wrong with an unusable file', { skip }, async () => {
    const text = join(dir, 'notes.txt');
    await writeFile(text, 'not a video');
    const notVideo = await upload(text);
    assert.equal(notVideo.status, 400);
    assert.match(notVideo.body.error, /doesn't look like a video file/);

    assert.equal((await upload(ride, { mode: 'loud' })).status, 400);

    const quiet = await upload(silent);
    assert.equal(quiet.status, 400);
    assert.match(quiet.body.error, /no sound.*Picture only/);
    assert.equal((await upload(silent, { mode: 'picture' })).status, 202);
  });

  test('a file over the size limit is refused', { skip }, async () => {
    process.env.AI_MAX_UPLOAD_MB = '0.001';
    const res = await upload(ride);
    assert.equal(res.status, 413);
    assert.deepEqual(await readdir(uploads), []);
  });

  test('cancelling a waiting analysis deletes its file', { skip }, async () => {
    const res = await upload(ride);
    await alice.post(`/api/jobs/${res.body._id}/cancel`);
    assert.deepEqual(await readdir(uploads), []);
  });

  test('if the file is gone (the server was restarted), it says to upload again', { skip }, async () => {
    const res = await upload(ride);
    const job = await Job.findById(res.body._id);
    await rm(job.uploadPath);
    await processNextJob({ extractFromUpload: fakeUploadExtract([]) });
    const { body } = await alice.get(`/api/jobs/${res.body._id}`);
    assert.equal(body.state, 'failed');
    assert.match(body.error, /upload it again/);
  });

  test('only the owner can upload, and the same limits apply', { skip }, async () => {
    const bob = await signedUpAgent('bob');
    const res = await bob.post(`/api/trails/${trailId}/ai-route/upload`).query({ durationSec: 4 }).set('Content-Type', 'video/mp4').send(await readFile(ride));
    assert.equal(res.status, 403);
    process.env.AI_JOBS_PER_USER_PER_DAY = '0';
    try {
      assert.equal((await upload(ride)).status, 429);
    } finally {
      delete process.env.AI_JOBS_PER_USER_PER_DAY;
    }
  });
});

test('old leftover uploads are swept away, recent ones kept', async () => {
  const leftovers = await mkdtemp(join(dir, 'leftovers-'));
  await writeFile(join(leftovers, 'old.video'), 'x');
  await writeFile(join(leftovers, 'new.video'), 'x');
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  await utimes(join(leftovers, 'old.video'), threeDaysAgo, threeDaysAgo);
  await removeOldUploads(leftovers);
  assert.deepEqual(await readdir(leftovers), ['new.video']);
});
