import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { useTestDatabase } from './helpers.js';

useTestDatabase();

// helpers.js switches the limits off for the other tests; these need them on,
// on an app of their own (each app counts for itself).
const limitedApp = () => {
  process.env.RATE_LIMITS = 'on';
  return createApp();
};

// Each test pretends to come from its own address, as Vercel says in X-Forwarded-For.
let addressCount = 0;
const newAddress = () => `203.0.113.${++addressCount}`;

async function signUp(app, address, email) {
  return request(app).post('/api/auth/signup').set('X-Forwarded-For', address).send({ name: 'Rider', email, password: 'correct horse' });
}

describe('rate limits', () => {
  test('wrong passwords for one account are stopped after eight tries, wherever they come from', async () => {
    const app = limitedApp();
    assert.equal((await signUp(app, newAddress(), 'rider@example.com')).status, 201);
    for (let i = 0; i < 8; i++) {
      const wrong = await request(app).post('/api/auth/login').set('X-Forwarded-For', newAddress()).send({ email: 'rider@example.com', password: 'wrong guess' });
      assert.equal(wrong.status, 401);
    }
    const blocked = await request(app).post('/api/auth/login').set('X-Forwarded-For', newAddress()).send({ email: 'RIDER@example.com', password: 'correct horse' });
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.error, /Too many tries to log in to this account/);
    assert.ok(blocked.headers['retry-after']);
    // Other accounts are not affected.
    assert.equal((await signUp(app, newAddress(), 'other@example.com')).status, 201);
    const other = await request(app).post('/api/auth/login').set('X-Forwarded-For', newAddress()).send({ email: 'other@example.com', password: 'correct horse' });
    assert.equal(other.status, 200);
  });

  test('logging in successfully is never limited', async () => {
    const app = limitedApp();
    const address = newAddress();
    await signUp(app, address, 'rider@example.com');
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', address).send({ email: 'rider@example.com', password: 'correct horse' });
      assert.equal(res.status, 200, `login ${i + 1}`);
    }
  });

  test('ten new accounts an hour from one address', async () => {
    const app = limitedApp();
    const address = newAddress();
    for (let i = 0; i < 10; i++) assert.equal((await signUp(app, address, `rider${i}@example.com`)).status, 201);
    const blocked = await signUp(app, address, 'rider10@example.com');
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.error, /Too many new accounts/);
    // Another address (its own visitor) can still sign up.
    assert.equal((await signUp(app, newAddress(), 'rider11@example.com')).status, 201);
  });

  test('logged-in limits count per user, not per address', async () => {
    const app = limitedApp();
    const address = newAddress();
    const alice = request.agent(app);
    await alice.post('/api/auth/signup').set('X-Forwarded-For', address).send({ name: 'Alice', email: 'alice@example.com', password: 'correct horse' });
    await alice.put('/api/auth/onboarding').set('X-Forwarded-For', address).send({ interests: ['riding'] });
    for (let i = 0; i < 10; i++) {
      assert.equal((await alice.post('/api/feedback').set('X-Forwarded-For', address).send({ message: `Idea ${i}` })).status, 201);
    }
    const blocked = await alice.post('/api/feedback').set('X-Forwarded-For', address).send({ message: 'One more' });
    assert.equal(blocked.status, 429);

    // Bob, on the same network, has his own allowance.
    const bob = request.agent(app);
    await bob.post('/api/auth/signup').set('X-Forwarded-For', address).send({ name: 'Bob', email: 'bob@example.com', password: 'correct horse' });
    await bob.put('/api/auth/onboarding').set('X-Forwarded-For', address).send({ interests: ['riding'] });
    assert.equal((await bob.post('/api/feedback').set('X-Forwarded-For', address).send({ message: 'Hello' })).status, 201);
  });

  test('answers say how much is left', async () => {
    const res = await request(limitedApp()).get('/api/health').set('X-Forwarded-For', newAddress());
    assert.equal(res.status, 200);
    assert.match(res.headers.ratelimit, /r=299/);
  });
});
