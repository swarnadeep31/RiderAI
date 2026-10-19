import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { normalizePhone, User } from '../src/models/User.js';
import { app, signedUpAgent, startFakeService, useTestDatabase } from './helpers.js';

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
    assert.equal(sameEmail.body.error, 'You already have an account with this email. Please log in.');
    assert.equal(sameEmail.body.code, 'exists');
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

  test('says when the password is wrong, and when there is no account to log in to', async () => {
    await request(app).post('/api/auth/signup').send(newUser());
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'rider@example.com', password: 'nope nope' });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.error, 'Wrong password. Try again.');
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'who@example.com', password: 'nope nope' });
    assert.equal(unknownEmail.status, 404);
    assert.equal(unknownEmail.body.code, 'not_found');
    assert.match(unknownEmail.body.error, /no account with this email yet\. Sign up/);
  });

  test('logging out ends the session, even for a copy of its cookie', async () => {
    const agent = request.agent(app);
    const signup = await agent.post('/api/auth/signup').send(newUser());
    const cookie = signup.headers['set-cookie'][0].split(';')[0];
    assert.equal((await agent.post('/api/auth/logout')).status, 204);
    assert.equal((await agent.get('/api/auth/me')).body.user, null);
    // Someone who copied the cookie before the logout is logged out too.
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.user, null);
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

describe('phone numbers and names', () => {
  test('phone numbers are written one way, whatever the spaces and country code', () => {
    assert.equal(normalizePhone('98765 43210'), '+919876543210');
    assert.equal(normalizePhone('+91 (987) 654-3210'), '+919876543210');
    assert.equal(normalizePhone('09876543210'), '+919876543210');
    assert.equal(normalizePhone('0044 20 7946 0958'), '+442079460958');
    assert.equal(normalizePhone('12345'), null);
    assert.equal(normalizePhone('call me'), null);
  });

  test('signs up with a name, a phone number and a password, then logs in with the number', async () => {
    const res = await request(app).post('/api/auth/signup').send({ name: 'Swarnadeep Roy', phone: '98765 43210', password: 'correct horse' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.name, 'Swarnadeep Roy');
    assert.equal(res.body.phone, '+919876543210');
    assert.equal(res.body.email, undefined);
    assert.match(res.body.username, /^swarnadeep_roy/);

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ phone: '+91 98765-43210', password: 'correct horse' });
    assert.equal(login.status, 200);
    assert.equal((await agent.get('/api/auth/me')).body.user.name, 'Swarnadeep Roy');
  });

  test('a phone number that already has an account says so', async () => {
    await request(app).post('/api/auth/signup').send({ name: 'A', phone: '9876543210', password: 'correct horse' });
    const again = await request(app).post('/api/auth/signup').send({ name: 'B', phone: '+919876543210', password: 'correct horse' });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'You already have an account with this phone number. Please log in.');
    assert.equal(again.body.code, 'exists');
  });

  test('several accounts can be made without an email (or without a phone)', async () => {
    for (const phone of ['9876543210', '9876543211']) {
      assert.equal((await request(app).post('/api/auth/signup').send({ name: 'P', phone, password: 'correct horse' })).status, 201);
    }
    for (const email of ['a@example.com', 'b@example.com']) {
      assert.equal((await request(app).post('/api/auth/signup').send({ name: 'E', email, password: 'correct horse' })).status, 201);
    }
  });

  test('explains a missing name, way in, or a bad number', async () => {
    for (const [body, message] of [
      [{ phone: '9876543210', password: 'correct horse' }, /Enter your name/],
      [{ name: 'A', password: 'correct horse' }, /email address or phone number/],
      [{ name: 'A', phone: '123', password: 'correct horse' }, /country code/],
    ]) {
      const res = await request(app).post('/api/auth/signup').send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.body.error, message);
    }
    const noAccount = await request(app).post('/api/auth/login').send({ phone: '9999999999', password: 'x' });
    assert.equal(noAccount.status, 404);
    assert.match(noAccount.body.error, /no account with this phone number yet/);
  });
});

// Logs in as someone already signed up; returns the cookie, as a device would keep it.
async function loginCookie(email = 'alice@example.com') {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'correct horse' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.headers['set-cookie'][0].split(';')[0];
}
const meWith = async (cookie) => (await request(app).get('/api/auth/me').set('Cookie', cookie)).body.user;

describe('sessions', () => {
  test('logging out on one device leaves the others logged in', async () => {
    await signedUpAgent('alice');
    const phone = await loginCookie();
    const laptop = await loginCookie();
    assert.equal((await request(app).post('/api/auth/logout').set('Cookie', phone)).status, 204);
    assert.equal(await meWith(phone), null);
    assert.equal((await meWith(laptop)).username, 'alice');
  });

  test('"log out on all devices" ends every login, this one included', async () => {
    await signedUpAgent('alice');
    const phone = await loginCookie();
    const laptop = await loginCookie();
    assert.equal((await request(app).post('/api/auth/logout-everywhere').set('Cookie', laptop)).status, 204);
    assert.equal(await meWith(phone), null);
    assert.equal(await meWith(laptop), null);
    assert.equal((await request(app).post('/api/auth/logout-everywhere')).status, 401, 'needs a login');
    // Logging in again works.
    assert.equal((await meWith(await loginCookie())).username, 'alice');
  });

  test('past the newest ten logins, the oldest device is logged out', async () => {
    const first = await signedUpAgent('alice'); // signing up is the first login
    const devices = [];
    for (let i = 0; i < 10; i++) devices.push(await loginCookie());
    assert.equal((await first.get('/api/auth/me')).body.user, null);
    for (const device of devices) assert.equal((await meWith(device)).username, 'alice');
    assert.equal((await User.findOne({ username: 'alice' }).select('+sessions')).sessions.length, 10);
  });

  test('logging out with a login from before logins were kept logs out everywhere', async () => {
    await signedUpAgent('alice');
    const user = await User.findOne({ username: 'alice' });
    const oldToken = jwt.sign({ sub: user.id, sv: 0 }, process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production', { expiresIn: '1d' });
    const oldCookie = `trailcast_session=${oldToken}`;
    const laptop = await loginCookie();
    assert.equal((await meWith(oldCookie)).username, 'alice');
    assert.equal((await request(app).post('/api/auth/logout').set('Cookie', oldCookie)).status, 204);
    assert.equal(await meWith(oldCookie), null);
    assert.equal(await meWith(laptop), null);
  });

  test('the list of logins is never sent to the browser', async () => {
    const agent = await signedUpAgent('alice');
    const { user } = (await agent.get('/api/auth/me')).body;
    assert.equal(user.sessions, undefined);
    assert.equal(user.sessionVersion, undefined);
  });

  test('raising the session version logs the account out everywhere', async () => {
    const agent = await signedUpAgent('alice');
    assert.equal((await agent.get('/api/auth/me')).body.user.username, 'alice');
    await User.updateOne({ username: 'alice' }, { $inc: { sessionVersion: 1 } });
    assert.equal((await agent.get('/api/auth/me')).body.user, null);
    // Logging in again works, with the new version.
    const login = await agent.post('/api/auth/login').send({ email: 'alice@example.com', password: 'correct horse' });
    assert.equal(login.status, 200);
    assert.equal((await agent.get('/api/auth/me')).body.user.username, 'alice');
  });

  test('logins from before session versions existed still work', async () => {
    await signedUpAgent('alice');
    const user = await User.findOne({ username: 'alice' });
    // A login made before: its token has no session version.
    const oldToken = jwt.sign({ sub: user.id }, process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production', { expiresIn: '1d' });
    const me = await request(app).get('/api/auth/me').set('Cookie', `trailcast_session=${oldToken}`);
    assert.equal(me.body.user.username, 'alice');
  });
});

describe('Continue with Google', () => {
  // A stand-in for Google's tokeninfo endpoint: which tokens are genuine, and for whom.
  const tokens = {
    'token-new': { sub: 'g-1', email: 'new@gmail.com', name: 'New Rider' },
    'token-existing-email': { sub: 'g-2', email: 'rider@example.com', name: 'Rider' },
    'token-other-site': { sub: 'g-3', email: 'x@gmail.com', aud: 'someone-elses-site' },
    'token-unverified': { sub: 'g-4', email: 'y@gmail.com', email_verified: 'false' },
  };
  let google;
  before(async () => {
    google = await startFakeService(({ url }) => {
      const token = new URL(url, 'http://x').searchParams.get('id_token');
      const info = tokens[token];
      if (!info) return [400, { error: 'invalid_token' }];
      return [200, { iss: 'https://accounts.google.com', aud: 'trailcast-client-id', exp: String(Math.floor(Date.now() / 1000) + 600), email_verified: 'true', ...info }];
    });
  });
  after(() => google.close());
  beforeEach(() => {
    process.env.GOOGLE_TOKENINFO_URL = `${google.url}/tokeninfo`;
    process.env.GOOGLE_CLIENT_ID = 'trailcast-client-id';
  });

  test('a new Google account signs up, and the next time logs in', async () => {
    const agent = request.agent(app);
    const first = await agent.post('/api/auth/google').send({ credential: 'token-new' });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.existing, false);
    assert.deepEqual([first.body.user.name, first.body.user.email], ['New Rider', 'new@gmail.com']);
    assert.equal((await agent.get('/api/auth/me')).body.user.email, 'new@gmail.com');

    const again = await request(app).post('/api/auth/google').send({ credential: 'token-new' });
    assert.equal(again.status, 200);
    assert.equal(again.body.existing, true);
    assert.equal(await User.countDocuments(), 1);
  });

  test('an account that already has the same email is used, not duplicated', async () => {
    await request(app).post('/api/auth/signup').send(newUser());
    const google = request.agent(app);
    const res = await google.post('/api/auth/google').send({ credential: 'token-existing-email' });
    assert.equal(res.status, 200);
    assert.equal(res.body.existing, true);
    assert.equal(res.body.user.username, 'mountain_rider');
    assert.equal(await User.countDocuments(), 1);
    assert.equal((await google.get('/api/auth/me')).body.user.username, 'mountain_rider');
  });

  test('linking Google to an account made with an unproven email removes its password and ends its other logins', async () => {
    // Anyone can sign up with an email that isn't theirs: here, with the Google user's email.
    const earlier = request.agent(app);
    assert.equal((await earlier.post('/api/auth/signup').send(newUser())).status, 201);

    const res = await request(app).post('/api/auth/google').send({ credential: 'token-existing-email' });
    assert.equal(res.status, 200);
    assert.equal(res.body.passwordRemoved, true);
    assert.equal(res.body.user.sessionVersion, undefined);

    // Whoever made the account can't use its password any more, and is logged out.
    const login = await request(app).post('/api/auth/login').send({ email: 'rider@example.com', password: 'correct horse' });
    assert.equal(login.status, 401);
    assert.match(login.body.error, /Continue with Google/);
    assert.equal((await earlier.get('/api/auth/me')).body.user, null);
    const saved = await User.findOne({ email: 'rider@example.com' });
    assert.equal(saved.emailVerified, true);

    // The next Google login is an ordinary one: nothing more is removed.
    const again = await request(app).post('/api/auth/google').send({ credential: 'token-existing-email' });
    assert.equal(again.body.passwordRemoved, false);
  });

  test('accounts made with Google have a proven email', async () => {
    await request(app).post('/api/auth/google').send({ credential: 'token-new' });
    assert.equal((await User.findOne({ email: 'new@gmail.com' })).emailVerified, true);
  });

  test("fake, foreign or unverified tokens don't get in", async () => {
    for (const credential of ['made-up', 'token-other-site', 'token-unverified', undefined]) {
      const res = await request(app).post('/api/auth/google').send({ credential });
      assert.equal(res.status, 401, String(credential));
    }
    assert.equal(await User.countDocuments(), 0);
  });

  test('a Google account has no password, so logging in with one says to use Google', async () => {
    await request(app).post('/api/auth/google').send({ credential: 'token-new' });
    const res = await request(app).post('/api/auth/login').send({ email: 'new@gmail.com', password: 'anything here' });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Continue with Google/);
  });

  test("without GOOGLE_CLIENT_ID, Google sign-in is off", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    assert.equal((await request(app).post('/api/auth/google').send({ credential: 'token-new' })).status, 401);
    assert.equal((await request(app).get('/api/config')).body.googleClientId, '');
  });
});
