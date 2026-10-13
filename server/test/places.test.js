import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { clearPlaceCache } from '../src/services/places.js';
import { app, signedUpAgent, startFakeService, useTestDatabase } from './helpers.js';

useTestDatabase();

let nominatim;
let failing = false;
before(async () => {
  nominatim = await startFakeService(() =>
    failing
      ? [503, {}]
      : [
          200,
          [
            {
              name: 'Rohtang Pass',
              display_name: 'Rohtang Pass, Kullu, Himachal Pradesh, India',
              lat: '32.3716',
              lon: '77.2466',
            },
            { name: '', display_name: 'Rohtang, Lahaul, India', lat: '32.4', lon: '77.2' },
          ],
        ],
  );
  process.env.NOMINATIM_BASE_URL = nominatim.url;
});
after(() => nominatim.close());

test('finds places by name, for logged-in users', async () => {
  clearPlaceCache();
  const agent = await signedUpAgent();
  const res = await agent.get('/api/places').query({ q: 'Rohtang Pass' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body[0], {
    name: 'Rohtang Pass',
    description: 'Rohtang Pass, Kullu, Himachal Pradesh, India',
    lat: 32.3716,
    lng: 77.2466,
  });
  assert.equal(res.body[1].name, 'Rohtang');

  const sent = new URL(nominatim.requests.at(-1).url, 'http://x');
  assert.equal(sent.searchParams.get('q'), 'Rohtang Pass');
  assert.equal(sent.searchParams.get('format'), 'jsonv2');
  assert.match(nominatim.requests.at(-1).headers['user-agent'], /TrailCast/);
});

test('asks the search service only once for the same search', async () => {
  clearPlaceCache();
  const agent = await signedUpAgent();
  const before = nominatim.requests.length;
  await agent.get('/api/places').query({ q: 'Manali' });
  await agent.get('/api/places').query({ q: ' manali ' });
  assert.equal(nominatim.requests.length, before + 1);
});

test('explains problems', async () => {
  clearPlaceCache();
  assert.equal((await request(app).get('/api/places').query({ q: 'Manali' })).status, 401);
  const agent = await signedUpAgent();
  assert.equal((await agent.get('/api/places').query({ q: ' ' })).status, 400);

  failing = true;
  const res = await agent.get('/api/places').query({ q: 'Spiti' });
  failing = false;
  assert.equal(res.status, 502);
  assert.match(res.body.error, /click the map/);
});
