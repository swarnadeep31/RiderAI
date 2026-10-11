import assert from 'node:assert/strict';
import { after, before, beforeEach } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();

// Each test file gets its own throwaway MongoDB, emptied before every test.
export function useTestDatabase() {
  let mongo;
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri('trailcast-test'));
  });
  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  });
}

// A browser-like client that keeps cookies, signed up as a new user.
export async function signedUpAgent(name = 'alice') {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/signup')
    .send({ email: `${name}@example.com`, username: name, password: 'correct horse' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return agent;
}

// A stand-in for an outside service (OpenRouteService, Nominatim). `handle`
// gets each request and its parsed JSON body, and returns [status, body].
export async function startFakeService(handle) {
  const { createServer } = await import('node:http');
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const request = { method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null };
    requests.push(request);
    const [status, body] = await handle(request);
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
