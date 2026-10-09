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
