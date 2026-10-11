import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { routeSegments } from '../src/services/routing.js';
import { startFakeService } from './helpers.js';

const points = [
  { lat: 32.24, lng: 77.19 },
  { lat: 32.3, lng: 77.2 },
  { lat: 32.37, lng: 77.25 },
];

// What OpenRouteService answers: a GeoJSON line (longitude first), and
// way_points saying where on the line each place we sent is.
const orsAnswer = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.191, 32.241],
          [77.195, 32.27],
          [77.201, 32.299],
          [77.23, 32.33],
          [77.249, 32.369],
        ],
      },
      properties: { way_points: [0, 2, 4] },
    },
  ],
};

describe('routeSegments', () => {
  let ors;
  beforeEach(() => {
    delete process.env.ORS_API_KEY;
    delete process.env.ORS_BASE_URL;
  });
  afterEach(async () => {
    await ors?.close();
    ors = null;
  });

  test('straight lines need no outside service', async () => {
    const { segments, notice } = await routeSegments(points, 'straight');
    assert.deepEqual(segments, [
      [[32.24, 77.19], [32.3, 77.2]],
      [[32.3, 77.2], [32.37, 77.25]],
    ]);
    assert.equal(notice, null);
  });

  test('without a key, falls back to straight lines and says why', async () => {
    const { segments, notice } = await routeSegments(points, 'roads');
    assert.equal(segments.length, 2);
    assert.equal(segments[0].length, 2);
    assert.match(notice, /ORS_API_KEY/);
  });

  test('follows roads with OpenRouteService, one piece per pair of key points', async () => {
    ors = await startFakeService(() => [200, orsAnswer]);
    process.env.ORS_BASE_URL = ors.url;
    process.env.ORS_API_KEY = 'test-key';

    const { segments, notice } = await routeSegments(points, 'roads');
    assert.equal(notice, null);

    const [request] = ors.requests;
    assert.equal(request.url, '/v2/directions/driving-car/geojson');
    assert.equal(request.headers.authorization, 'test-key');
    assert.deepEqual(request.body.coordinates, [
      [77.19, 32.24],
      [77.2, 32.3],
      [77.25, 32.37],
    ]);
    assert.deepEqual(request.body.radiuses, [-1, -1, -1]);

    // Each piece starts and ends exactly at the key points, with the road in between.
    assert.deepEqual(segments[0], [[32.24, 77.19], [32.241, 77.191], [32.27, 77.195], [32.299, 77.201], [32.3, 77.2]]);
    assert.deepEqual(segments[1], [[32.3, 77.2], [32.299, 77.201], [32.33, 77.23], [32.369, 77.249], [32.37, 77.25]]);
  });

  test('uses footpaths for treks', async () => {
    ors = await startFakeService(() => [200, orsAnswer]);
    process.env.ORS_BASE_URL = ors.url;
    process.env.ORS_API_KEY = 'test-key';
    await routeSegments(points, 'paths');
    assert.equal(ors.requests[0].url, '/v2/directions/foot-hiking/geojson');
  });

  test('works out the way points from the steps if they are missing', async () => {
    const answer = structuredClone(orsAnswer);
    delete answer.features[0].properties.way_points;
    answer.features[0].properties.segments = [
      { steps: [{ way_points: [0, 1] }, { way_points: [1, 2] }, { way_points: [2, 2] }] },
      { steps: [{ way_points: [2, 4] }, { way_points: [4, 4] }] },
    ];
    ors = await startFakeService(() => [200, answer]);
    process.env.ORS_BASE_URL = ors.url;
    process.env.ORS_API_KEY = 'test-key';
    const { segments, notice } = await routeSegments(points, 'roads');
    assert.equal(notice, null);
    assert.equal(segments[0].length, 5);
  });

  test('if OpenRouteService refuses, falls back to straight lines and passes on its reason', async () => {
    ors = await startFakeService(() => [404, { error: { code: 2010, message: 'Could not find routable point' } }]);
    process.env.ORS_BASE_URL = ors.url;
    process.env.ORS_API_KEY = 'test-key';
    const { segments, notice } = await routeSegments(points, 'roads');
    assert.equal(segments[0].length, 2);
    assert.match(notice, /Could not find routable point/);
  });

  test('long routes are asked for in pieces', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ lat: 32 + i / 100, lng: 77 }));
    ors = await startFakeService(({ body }) => {
      const coordinates = body.coordinates;
      return [200, { features: [{ geometry: { coordinates }, properties: { way_points: coordinates.map((_, i) => i) } }] }];
    });
    process.env.ORS_BASE_URL = ors.url;
    process.env.ORS_API_KEY = 'test-key';
    const { segments, notice } = await routeSegments(many, 'roads');
    assert.equal(notice, null);
    assert.equal(ors.requests.length, 2);
    assert.equal(ors.requests[0].body.coordinates.length, 25);
    assert.equal(ors.requests[1].body.coordinates.length, 6); // starts again from place 25
    assert.equal(segments.length, 29);
  });
});
