import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { app, signedUpAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

test('most requests are kept to 100 KB, but a long route still fits', async () => {
  const filler = 'a'.repeat(300 * 1024);
  const login = await request(app).post('/api/auth/login').send({ email: `${filler}@x.test`, password: 'x' });
  assert.equal(login.status, 413);
  assert.match(login.body.error, /too big/);

  const alice = await signedUpAgent('alice');
  assert.equal((await alice.post('/api/feedback').send({ message: filler })).status, 413);

  // A recorded ride of 20,000 points (about 1 MB) goes through.
  const track = Array.from({ length: 20000 }, (_, i) => [32.24 + i * 0.0003, 77.19 + (i % 7) * 0.0001]);
  const trackTimes = track.map((_, i) => i);
  const ride = await alice.post('/api/trails').send({ title: 'Long ride', youtubeUrl: 'https://youtu.be/aBcD3fGh1_-', track, trackTimes });
  assert.equal(ride.status, 201, JSON.stringify(ride.body).slice(0, 200));
  // And can be sent again when changed.
  assert.equal((await alice.patch(`/api/trails/${ride.body._id}`).send({ track: track.slice(10), trackTimes: trackTimes.slice(10) })).status, 200);
});
