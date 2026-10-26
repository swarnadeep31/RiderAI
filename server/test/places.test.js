import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { clearPlaceCache, searchPlaces } from '../src/services/places.js';
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
    coarse: false,
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

test('when Nominatim refuses (as it often does on shared cloud servers), OpenRouteService answers instead', async () => {
  const ors = await startFakeService(() => [
    200,
    {
      features: [
        {
          geometry: { coordinates: [75.298, 34.304] },
          properties: { name: 'Sonamarg', locality: 'Sonamarg', county: 'Ganderbal', region: 'Jammu and Kashmir', country: 'Pakistan', label: 'Sonamarg, Pakistan' },
        },
      ],
    },
  ]);
  process.env.ORS_BASE_URL = ors.url;
  process.env.ORS_API_KEY = 'test-key';
  failing = true;
  try {
    clearPlaceCache();
    const agent = await signedUpAgent();
    const res = await agent.get('/api/places').query({ q: 'Sonamarg' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // The position from OpenRouteService, and a label without its country (it puts Kashmir in Pakistan).
    assert.deepEqual(res.body, [{ name: 'Sonamarg', description: 'Sonamarg, Ganderbal, Jammu and Kashmir', lat: 34.304, lng: 75.298, coarse: false }]);
    const sent = ors.requests.at(-1);
    assert.match(sent.url, /^\/geocode\/search\?/);
    assert.equal(new URL(sent.url, 'http://x').searchParams.get('text'), 'Sonamarg');
    assert.equal(sent.headers.authorization, 'test-key', 'the key goes in a header, not the address');
    assert.equal(new URL(sent.url, 'http://x').searchParams.get('api_key'), null);
  } finally {
    failing = false;
    delete process.env.ORS_API_KEY;
    delete process.env.ORS_BASE_URL;
    await ors.close();
  }
});

test('can keep to a box, and says which results are whole regions', async () => {
  const nominatimBox = await startFakeService(() => [
    200,
    [
      { name: 'Bihar', display_name: 'Bihar, India', lat: '25.6', lon: '85.1', place_rank: 8 },
      { name: 'Dehri', display_name: 'Dehri, Rohtas, Bihar, India', lat: '24.9', lon: '84.18', place_rank: 16 },
    ],
  ]);
  const saved = process.env.NOMINATIM_BASE_URL;
  process.env.NOMINATIM_BASE_URL = nominatimBox.url;
  try {
    clearPlaceCache();
    const found = await searchPlaces('Dehri', { near: [24, 85], within: { south: 21, west: 82.7, north: 26.4, east: 89.9 } });
    assert.deepEqual(found.map((p) => [p.name, p.coarse]), [['Bihar', true], ['Dehri', false]]);
    const sent = new URL(nominatimBox.requests.at(-1).url, 'http://x').searchParams;
    assert.equal(sent.get('viewbox'), '82.7,26.4,89.9,21');
    assert.equal(sent.get('bounded'), '1');
  } finally {
    process.env.NOMINATIM_BASE_URL = saved;
    await nominatimBox.close();
  }
});

test('OpenRouteService keeps to the box too, and its whole regions are marked', async () => {
  const ors = await startFakeService(() => [
    200,
    {
      features: [
        { geometry: { coordinates: [88, 24] }, properties: { name: 'West Bengal', layer: 'region' } },
        { geometry: { coordinates: [87.31, 23.52] }, properties: { name: 'Durgapur', layer: 'locality', region: 'West Bengal' } },
      ],
    },
  ]);
  process.env.ORS_BASE_URL = ors.url;
  process.env.ORS_API_KEY = 'test-key';
  failing = true;
  try {
    clearPlaceCache();
    const found = await searchPlaces('Durgapur', { near: [22.57, 88.36], within: { south: 21, west: 82.7, north: 26.4, east: 89.9 } });
    assert.deepEqual(found.map((p) => [p.name, p.coarse]), [['West Bengal', true], ['Durgapur', false]]);
    const sent = new URL(ors.requests.at(-1).url, 'http://x').searchParams;
    assert.deepEqual(
      ['boundary.rect.min_lat', 'boundary.rect.min_lon', 'boundary.rect.max_lat', 'boundary.rect.max_lon', 'focus.point.lat'].map((key) => sent.get(key)),
      ['21', '82.7', '26.4', '89.9', '22.57'],
    );
  } finally {
    failing = false;
    delete process.env.ORS_API_KEY;
    delete process.env.ORS_BASE_URL;
    await ors.close();
  }
});
