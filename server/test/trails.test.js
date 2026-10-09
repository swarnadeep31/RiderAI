import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Trail } from '../src/models/Trail.js';

const app = createApp();
let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('trailcast-test'));
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(() => Trail.deleteMany({}));

const newTrail = (overrides = {}) => ({
  title: 'Manali to Rohtang',
  youtubeUrl: 'https://youtu.be/aBcD3fGh1_-',
  activity: 'ride',
  track: [
    [32.24, 77.19],
    [32.3, 77.2],
    [32.37, 77.25],
  ],
  trackTimes: [0, 600, 1200],
  ...overrides,
});

async function createTrail(overrides) {
  const res = await request(app).post('/api/trails').send(newTrail(overrides));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

describe('trails', () => {
  test('creates a trail from a YouTube link', async () => {
    const trail = await createTrail();
    assert.equal(trail.youtubeId, 'aBcD3fGh1_-');
    assert.equal(trail.title, 'Manali to Rohtang');
    assert.deepEqual(trail.track[1], [32.3, 77.2]);
    assert.equal(trail.videoStartsAt, 0);
    assert.deepEqual(trail.points, []);
  });

  test('ignores fields that clients are not allowed to set', async () => {
    const trail = await createTrail({ youtubeId: 'zzzzzzzzzzz', createdAt: '2000-01-01' });
    assert.equal(trail.youtubeId, 'aBcD3fGh1_-');
    assert.notEqual(new Date(trail.createdAt).getFullYear(), 2000);
  });

  test('explains what is wrong with bad input', async () => {
    const cases = [
      [{ youtubeUrl: 'https://vimeo.com/1' }, /YouTube video link/],
      [{ title: '' }, /title/],
      [{ activity: 'flying' }, /activity/],
      [{ supportUrl: 'javascript:alert(1)' }, /http/],
      [{ track: [[95, 10]] }, /latitude, longitude/],
      [{ track: [['north', 10]] }, /wrong type/],
      [{ trackTimes: [0, 10] }, /one for one/],
      [{ trackTimes: [0, 20, 10] }, /backwards/],
    ];
    for (const [overrides, message] of cases) {
      const res = await request(app).post('/api/trails').send(newTrail(overrides));
      assert.equal(res.status, 400, JSON.stringify(overrides));
      assert.match(res.body.error, message);
    }
  });

  test('lists trails newest first, without the full route', async () => {
    await createTrail({ title: 'First' });
    await createTrail({ title: 'Second' });
    const res = await request(app).get('/api/trails');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((t) => t.title), ['Second', 'First']);
    assert.equal(res.body[0].track, undefined);
  });

  test('gets, updates and deletes a trail', async () => {
    const { _id } = await createTrail();

    const got = await request(app).get(`/api/trails/${_id}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.track.length, 3);

    const updated = await request(app)
      .patch(`/api/trails/${_id}`)
      .send({ videoStartsAt: 95, supportUrl: 'https://ko-fi.com/rider' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.videoStartsAt, 95);
    assert.equal(updated.body.supportUrl, 'https://ko-fi.com/rider');

    const badUpdate = await request(app).patch(`/api/trails/${_id}`).send({ youtubeUrl: 'nope' });
    assert.equal(badUpdate.status, 400);

    assert.equal((await request(app).delete(`/api/trails/${_id}`)).status, 204);
    assert.equal((await request(app).get(`/api/trails/${_id}`)).status, 404);
  });

  test('answers 404 for trails that do not exist', async () => {
    assert.equal((await request(app).get('/api/trails/000000000000000000000000')).status, 404);
    assert.equal((await request(app).get('/api/trails/not-an-id')).status, 404);
    assert.equal((await request(app).delete('/api/trails/000000000000000000000000')).status, 404);
  });
});

describe('key points', () => {
  test('are kept in video order', async () => {
    const { _id } = await createTrail();
    const point = (time, name) => ({ time, name, lat: 32.3, lng: 77.2 });

    await request(app).post(`/api/trails/${_id}/points`).send(point(300, 'Marhi'));
    const res = await request(app).post(`/api/trails/${_id}/points`).send(point(60, 'Start'));
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.points.map((p) => p.name), ['Start', 'Marhi']);
  });

  test('can be edited and deleted', async () => {
    const { _id } = await createTrail();
    const added = await request(app)
      .post(`/api/trails/${_id}/points`)
      .send({ time: 60, name: 'Viewpoint', note: 'Great tea stall', lat: 32.3, lng: 77.2 });
    const pointId = added.body.points[0]._id;

    const edited = await request(app).patch(`/api/trails/${_id}/points/${pointId}`).send({ name: 'Rohtang top' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.points[0].name, 'Rohtang top');
    assert.equal(edited.body.points[0].note, 'Great tea stall');

    const deleted = await request(app).delete(`/api/trails/${_id}/points/${pointId}`);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body.points, []);

    const missing = await request(app).delete(`/api/trails/${_id}/points/${pointId}`);
    assert.equal(missing.status, 404);
  });

  test('need a name, a time and a real location', async () => {
    const { _id } = await createTrail();
    for (const [body, message] of [
      [{ time: 10, lat: 32, lng: 77 }, /name/],
      [{ name: 'X', lat: 32, lng: 77 }, /video time/],
      [{ name: 'X', time: 10, lat: 91, lng: 77 }, /Latitude/],
      [{ name: 'X', time: 10, lat: 32, lng: 181 }, /Longitude/],
    ]) {
      const res = await request(app).post(`/api/trails/${_id}/points`).send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.body.error, message);
    }
  });
});

test('unknown API routes answer with JSON', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.match(res.body.error, /No API route/);
});
