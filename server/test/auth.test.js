import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { app, signedUpAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

const newUser = (overrides = {}) => ({
  email: 'Rider@Example.com',
  username: 'Mountain_Rider',
  password: 'correct horse',
  ...overrides,
});

describe('sign up', () => {
  test('creates the account and logs the user in', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/signup').send(newUser());
    assert.equal(res.status, 201);
    assert.equal(res.body.email, 'rider@example.com');
    assert.equal(res.body.username, 'mountain_rider');
    assert.equal(res.body.passwordHash, undefined);
    assert.equal(res.body.onboardedAt, undefined);

    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /trailcast_session=/);
    assert.match(cookie, /HttpOnly/);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.body.user.username, 'mountain_rider');
  });

  test('refuses a second account with the same email or username', async () => {
    await request(app).post('/api/auth/signup').send(newUser());
    const sameEmail = await request(app).post('/api/auth/signup').send(newUser({ username: 'someone_else' }));
    assert.equal(sameEmail.status, 409);
    assert.match(sameEmail.body.error, /already has an account/);
    const sameName = await request(app).post('/api/auth/signup').send(newUser({ email: 'other@example.com' }));
    assert.equal(sameName.status, 409);
    assert.match(sameName.body.error, /username is taken/);
  });

  test('explains what is wrong with the form', async () => {
    for (const [overrides, message] of [
      [{ email: 'not-an-email' }, /valid email/],
      [{ username: 'ab' }, /at least 3/],
      [{ username: 'has space' }, /letters, numbers/],
      [{ password: 'short' }, /at least 8/],
      [{ password: undefined }, /at least 8/],
    ]) {
      const res = await request(app).post('/api/auth/signup').send(newUser(overrides));
      assert.equal(res.status, 400, JSON.stringify(overrides));
      assert.match(res.body.error, message);
    }
  });
});

describe('log in and out', () => {
  test('logs in with email and password, in any letter case', async () => {
    await request(app).post('/api/auth/signup').send(newUser());
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email: 'RIDER@example.com ', password: 'correct horse' });
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'mountain_rider');
    assert.equal(res.body.passwordHash, undefined);
    assert.equal((await agent.get('/api/auth/me')).body.user.username, 'mountain_rider');
  });

  test('gives the same answer for a wrong password and an unknown email', async () => {
    await request(app).post('/api/auth/signup').send(newUser());
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'rider@example.com', password: 'nope nope' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'who@example.com', password: 'nope nope' });
    for (const res of [wrongPassword, unknownEmail]) {
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Wrong email or password.');
    }
  });

  test('logging out ends the session', async () => {
    const agent = await signedUpAgent();
    assert.equal((await agent.post('/api/auth/logout')).status, 204);
    assert.equal((await agent.get('/api/auth/me')).body.user, null);
  });

  test('a forged session cookie is ignored', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'trailcast_session=not.a.real.token');
    assert.equal(res.status, 200);
    assert.equal(res.body.user, null);
  });
});

describe('onboarding', () => {
  test('saves what the user wants TrailCast for, plus the optional answers', async () => {
    const agent = await signedUpAgent();
    const res = await agent
      .put('/api/auth/onboarding')
      .send({ interests: ['riding', 'trekking', 'riding'], referralSource: 'youtube', wishlist: 'Ladakh routes' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.interests, ['riding', 'trekking']);
    assert.equal(res.body.referralSource, 'youtube');
    assert.equal(res.body.wishlist, 'Ladakh routes');
    assert.ok(res.body.onboardedAt);
  });

  test('the optional answers can be left out', async () => {
    const agent = await signedUpAgent();
    const res = await agent.put('/api/auth/onboarding').send({ interests: ['climbing'] });
    assert.equal(res.status, 200);
    assert.equal(res.body.referralSource, '');
  });

  test('needs at least one interest, from the list', async () => {
    const agent = await signedUpAgent();
    assert.equal((await agent.put('/api/auth/onboarding').send({ interests: [] })).status, 400);
    assert.equal((await agent.put('/api/auth/onboarding').send({})).status, 400);
    assert.equal((await agent.put('/api/auth/onboarding').send({ interests: ['flying'] })).status, 400);
  });

  test('needs a logged-in user', async () => {
    const res = await request(app).put('/api/auth/onboarding').send({ interests: ['riding'] });
    assert.equal(res.status, 401);
  });
});

describe('feedback', () => {
  test('logged-in users can send feedback', async () => {
    const agent = await signedUpAgent();
    assert.equal((await agent.post('/api/feedback').send({ message: 'Love the map!' })).status, 201);
    assert.equal((await agent.post('/api/feedback').send({ message: '  ' })).status, 400);
    assert.equal((await request(app).post('/api/feedback').send({ message: 'Hi' })).status, 401);
  });
});
