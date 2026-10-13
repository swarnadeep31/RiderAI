import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { processNextJob } from '../src/jobs/worker.js';
import { Job } from '../src/models/Job.js';
import { RouteServices } from '../src/models/RouteServices.js';
import { buildQuery, capItems, chunkRoute, fuelGaps, placeItems, readElements } from '../src/routeExtras/services.js';
import { cumulativeDistances } from '../src/utils/geo.js';
import { signedUpAgent, startFakeService, useTestDatabase } from './helpers.js';

// An answer recorded from the real Overpass server, along samples/sample-ride.gpx.
const recorded = JSON.parse(readFileSync(new URL('./fixtures/overpass/manali-sample-ride.json', import.meta.url), 'utf8'));
const sampleTrack = [...readFileSync(new URL('../../samples/sample-ride.gpx', import.meta.url), 'utf8').matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"/g)].map((m) => [
  Number(m[1]),
  Number(m[2]),
]);

// A road north along a meridian, one point every ~1.1 km: 0.01 degrees of latitude.
const road = (km) => Array.from({ length: Math.round(km / 1.112) + 1 }, (_, i) => [20 + i * 0.01, 78 + (i % 2) * 0.001]);

describe('chunkRoute', () => {
  test('pieces of at most 200 km, each starting where the last ended', () => {
    const track = road(500);
    const chunks = chunkRoute(track);
    assert.equal(chunks.length, 3);
    const cum = (locations) => cumulativeDistances(locations).at(-1);
    for (const chunk of chunks) assert.ok(cum(chunk) <= 201000, `a piece of ${cum(chunk)} m`);
    assert.deepEqual(chunks[0].at(-1), chunks[1][0]);
    assert.deepEqual(chunks[0][0], track[0]);
    assert.deepEqual(chunks.at(-1).at(-1), track.at(-1));
  });

  test('a short route is one piece, simplified', () => {
    const chunks = chunkRoute(sampleTrack);
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].length < sampleTrack.length / 10);
  });

  test('a very winding route is simplified harder, so it stays about one query per 200 km', () => {
    // 150 km of tight zigzags, 600 m apart sideways.
    const zigzag = Array.from({ length: 3000 }, (_, i) => [20 + i * 0.00045, 78 + (i % 2) * 0.0055]);
    assert.equal(chunkRoute(zigzag).length, 1);
  });
});

test('buildQuery asks for each kind of place within its distance of the line', () => {
  const query = buildQuery([
    [32.24, 77.19],
    [32.3, 77.2],
  ]);
  assert.match(query, /^\[out:json\]\[timeout:90\]/);
  assert.match(query, /nwr\["amenity"="fuel"\]\(around:2000,32\.24000,77\.19000,32\.30000,77\.20000\);/);
  assert.match(query, /nwr\["shop"~"\^\(car_repair\|motorcycle_repair\|tyres\)\$"\]\(around:1000,/);
  assert.match(query, /nwr\["amenity"~"\^\(hospital\|clinic\)\$"\]\(around:5000,/);
  assert.match(query, /nwr\["amenity"="bank"\]\["atm"="yes"\]\(around:1000,/);
  assert.match(query, /out center tags;$/);
});

describe('readElements', () => {
  test('reads the recorded answer', () => {
    const items = readElements(recorded.elements);
    const kinds = Object.groupBy(items, (item) => item.kind);
    assert.deepEqual(
      Object.fromEntries(Object.entries(kinds).map(([kind, list]) => [kind, list.length])),
      { atm: 15, fuel: 3, medical: 9, mechanic: 2 },
    );
    assert.ok(items.every((item) => /^[nwr]\d+$/.test(item.osm)));
  });

  test('uses the centre of buildings, a bank only with an ATM, and skips the rest', () => {
    const items = readElements([
      { type: 'way', id: 7, center: { lat: 32.1, lon: 77.1 }, tags: { amenity: 'hospital', name: 'Mission Hospital', emergency: 'yes' } },
      { type: 'node', id: 8, lat: 32.2, lon: 77.2, tags: { amenity: 'bank', atm: 'yes', operator: 'SBI' } },
      { type: 'node', id: 9, lat: 32.2, lon: 77.2, tags: { amenity: 'bank' } },
      { type: 'node', id: 10, lat: 32.2, lon: 77.2, tags: { amenity: 'cafe' } },
      { type: 'node', id: 11, tags: { amenity: 'fuel' } },
    ]);
    assert.deepEqual(
      items.map((item) => [item.kind, item.osm, item.name ?? item.brand, item.lat, item.emergency]),
      [
        ['medical', 'w7', 'Mission Hospital', 32.1, true],
        ['atm', 'n8', 'SBI', 32.2, undefined],
      ],
    );
  });
});

describe('placeItems', () => {
  const track = road(20);
  const item = (kind, osm, lat, lng) => ({ kind, osm, lat, lng });

  test('places each once along the route, within its distance', () => {
    const placed = placeItems(
      [
        item('fuel', 'n1', 20.1, 78.015), // about 1.5 km off: kept (2 km for fuel)
        item('atm', 'n2', 20.1, 78.015), // the same distance off: too far for an ATM (1 km)
        item('fuel', 'n1', 20.1, 78.015), // found again by the next piece
        item('medical', 'n3', 20.05, 78.04), // 4 km off: kept (5 km for medical help)
      ],
      track,
    );
    assert.deepEqual(
      placed.map((p) => [p.osm, p.kind]),
      [
        ['n3', 'medical'],
        ['n1', 'fuel'],
      ],
    );
    assert.ok(Math.abs(placed[1].alongM - 11120) < 200);
    assert.ok(placed[1].offM > 1400 && placed[1].offM < 1700);
  });
});

test('capItems keeps the closest per kilometre when a kind has too many', () => {
  const atms = Array.from({ length: 50 }, (_, i) => ({ kind: 'atm', osm: `n${i}`, alongM: Math.floor(i / 10) * 1000 + i, offM: 100 - i }));
  const fuel = [{ kind: 'fuel', osm: 'f', alongM: 0, offM: 5 }];
  const capped = capItems([...atms, ...fuel], 20);
  assert.equal(capped.filter((c) => c.kind === 'atm').length, 5, 'one per km');
  assert.equal(capped.filter((c) => c.kind === 'fuel').length, 1, 'other kinds are untouched');
  assert.deepEqual(capped.filter((c) => c.kind === 'atm').map((c) => c.osm), ['n9', 'n19', 'n29', 'n39', 'n49']);
});

describe('fuelGaps', () => {
  const station = (alongM, extra = {}) => ({ kind: 'fuel', alongM, lat: 32, lng: 77, ...extra });
  const points = [{ name: 'Tandi', lat: 32.05, lng: 77 }];

  test('no stations: one gap from the start to the end', () => {
    assert.deepEqual(fuelGaps([], 475000, points), [{ fromM: 0, toM: 475000, lengthM: 475000, afterName: 'the start', beforeName: 'the end' }]);
  });

  test('one station: the longer side first, named after the station and the nearest key point', () => {
    const gaps = fuelGaps([station(110000, { brand: 'HP' })], 475000, points);
    assert.deepEqual(gaps.map((g) => [g.fromM, g.toM, g.afterName, g.beforeName]), [
      [110000, 475000, 'HP, Tandi', 'the end'],
      [0, 110000, 'the start', 'HP, Tandi'],
    ]);
  });

  test('stations right at the start or end, in any order', () => {
    const gaps = fuelGaps([station(475000, { name: 'Leh pump' }), station(0, { name: 'Manali pump' }), station(200000)], 475000, []);
    assert.deepEqual(gaps.map((g) => [g.fromM, g.toM, g.afterName, g.beforeName]), [
      [200000, 475000, 'a fuel station', 'Leh pump'],
      [0, 200000, 'Manali pump', 'a fuel station'],
    ]);
  });

  test('only fuel stations count', () => {
    const gaps = fuelGaps([{ kind: 'atm', alongM: 100, lat: 32, lng: 77 }], 1000, []);
    assert.equal(gaps.length, 1);
  });
});

describe('the services stage of the route-enrich job', () => {
  useTestDatabase();
  let overpass;
  let alice;
  const youtubeUrl = 'https://youtu.be/aBcD3fGh1_-';
  beforeEach(async () => {
    process.env.ROUTE_ENRICH_DELAY_SEC = '0';
    delete process.env.ORS_API_KEY;
    alice = await signedUpAgent('alice');
  });
  afterEach(async () => {
    await overpass?.close();
    overpass = null;
  });

  // A fake Overpass: `answers` are [status, body] replies, in order; the last repeats.
  async function fakeOverpass(...answers) {
    overpass = await startFakeService(() => answers.shift() ?? [500, {}]);
    const saved = process.env.OVERPASS_URL;
    process.env.OVERPASS_URL = `${overpass.url}/api/interpreter`;
    return () => {
      process.env.OVERPASS_URL = saved;
    };
  }

  test('finds the services once per route version, and viewers only read them', async () => {
    const restore = await fakeOverpass([200, recorded]);
    try {
      const { body: trail } = await alice.post('/api/trails').send({ title: 'Sample', youtubeUrl, track: sampleTrack });
      assert.deepEqual((await alice.get(`/api/trails/${trail._id}/services`)).body, { status: 'pending' });

      await processNextJob();
      assert.equal(overpass.requests.length, 1);
      const request = overpass.requests[0];
      assert.match(request.headers['user-agent'], /^TrailCast/);
      assert.equal(request.headers['content-type'], 'application/x-www-form-urlencoded');

      const { body: found } = await alice.get(`/api/trails/${trail._id}/services`);
      assert.equal(found.status, 'ready');
      assert.equal(found.routeVersion, 1);
      assert.equal(found.items.length, 29);
      assert.ok(found.items.every((item, i) => i === 0 || item.alongM >= found.items[i - 1].alongM));
      assert.ok(found.fuelGaps.length >= 1);

      // The stats get the longest stretch without fuel.
      const { body: after } = await alice.get(`/api/trails/${trail._id}`);
      assert.deepEqual(after.stats.longestFuelGap, found.fuelGaps[0]);

      // Viewing again doesn't ask Overpass.
      await alice.get(`/api/trails/${trail._id}/services`);
      assert.equal(overpass.requests.length, 1);

      // A new route shape makes them out of date until the job runs again.
      await alice.patch(`/api/trails/${trail._id}`).send({ track: sampleTrack.slice(0, 300) });
      assert.deepEqual((await alice.get(`/api/trails/${trail._id}/services`)).body, { status: 'pending' });
    } finally {
      restore();
    }
  });

  test('waits and tries again when Overpass says it is busy', async () => {
    const restore = await fakeOverpass([429, { remark: 'rate limited' }], [200, recorded]);
    try {
      const { body: trail } = await alice.post('/api/trails').send({ title: 'Sample', youtubeUrl, track: sampleTrack });
      await processNextJob();
      assert.equal(overpass.requests.length, 2);
      assert.equal((await alice.get(`/api/trails/${trail._id}/services`)).body.status, 'ready');
    } finally {
      restore();
    }
  });

  test('when Overpass keeps failing, it says so and tries again in 6 hours', async () => {
    const restore = await fakeOverpass([500, { remark: 'broken' }]);
    try {
      const { body: trail } = await alice.post('/api/trails').send({ title: 'Sample', youtubeUrl, track: sampleTrack });
      await processNextJob();
      const { body: failed } = await alice.get(`/api/trails/${trail._id}/services`);
      assert.equal(failed.status, 'failed');
      assert.match(failed.error, /Overpass/);
      const hours = (Date.parse(failed.retryAt) - Date.now()) / 3600000;
      assert.ok(hours > 5.9 && hours <= 6, `retry in ${hours} hours`);

      // The first job still finished (heights and stats don't need Overpass)...
      const jobs = await Job.find({ type: 'route-enrich', trail: trail._id }).sort({ createdAt: 1 }).lean();
      assert.equal(jobs[0].state, 'done');
      // ...and a retry waits for its time, starting at the services stage.
      assert.deepEqual([jobs[1].state, jobs[1].stage], ['queued', 'services']);
      assert.ok(jobs[1].lockedUntil > new Date(Date.now() + 5.9 * 3600000));

      // At most 3 retries.
      await RouteServices.updateOne({ trail: trail._id }, { attempts: 3 });
      await Job.updateOne({ _id: jobs[1]._id }, { lockedUntil: new Date(0) });
      await processNextJob();
      const { body: last } = await alice.get(`/api/trails/${trail._id}/services`);
      assert.equal(last.retryAt, null);
      assert.equal(await Job.countDocuments({ type: 'route-enrich', trail: trail._id }), 2);
    } finally {
      restore();
    }
  });

  test('routes drawn as straight lines have no services', async () => {
    const restore = await fakeOverpass([200, recorded]);
    try {
      const { body: trail } = await alice.post('/api/trails').send({ title: 'Drawn', youtubeUrl });
      await alice.post(`/api/trails/${trail._id}/points`).send({ time: 0, name: 'A', lat: 32.24, lng: 77.19 });
      await alice.post(`/api/trails/${trail._id}/points`).send({ time: 60, name: 'B', lat: 32.3, lng: 77.2 });
      await alice.post(`/api/trails/${trail._id}/route`).send({ style: 'straight' });
      await processNextJob();
      assert.equal(overpass.requests.length, 0);
      assert.deepEqual((await alice.get(`/api/trails/${trail._id}/services`)).body, { status: 'unavailable', reason: 'straight' });
    } finally {
      restore();
    }
  });

  test('a trail without a route, or a server with the feature off, says so', async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Nothing yet', youtubeUrl });
    assert.deepEqual((await alice.get(`/api/trails/${trail._id}/services`)).body, { status: 'unavailable', reason: 'no_route' });
    process.env.ROUTE_SERVICES = 'off';
    try {
      assert.deepEqual((await alice.get(`/api/trails/${trail._id}/services`)).body, { status: 'unavailable', reason: 'off' });
    } finally {
      delete process.env.ROUTE_SERVICES;
    }
  });

  test('the owner can ask for it all again, 3 times a day', async () => {
    const { body: trail } = await alice.post('/api/trails').send({ title: 'Sample', youtubeUrl, track: sampleTrack });
    for (let i = 0; i < 3; i++) assert.equal((await alice.post(`/api/trails/${trail._id}/enrich`)).status, 202);
    const fourth = await alice.post(`/api/trails/${trail._id}/enrich`);
    assert.equal(fourth.status, 429);
    const bob = await signedUpAgent('bob');
    assert.equal((await bob.post(`/api/trails/${trail._id}/enrich`)).status, 403);
    // Only the latest request waits; the others were replaced.
    assert.equal(await Job.countDocuments({ type: 'route-enrich', trail: trail._id, state: 'queued' }), 1);
  });
});
