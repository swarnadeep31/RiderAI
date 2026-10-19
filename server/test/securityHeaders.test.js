import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { app, useTestDatabase } from './helpers.js';

useTestDatabase();

test('every answer carries the security headers, errors included', async () => {
  for (const path of ['/api/health', '/api/no-such-thing', '/api/trails/000000000000000000000000']) {
    const res = await request(app).get(path);
    assert.equal(res.headers['content-security-policy'], "default-src 'none'; frame-ancestors 'none'", path);
    assert.equal(res.headers['x-frame-options'], 'DENY', path);
    assert.equal(res.headers['x-content-type-options'], 'nosniff', path);
    assert.equal(res.headers['referrer-policy'], 'no-referrer', path);
    assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin', path);
    assert.equal(res.headers['x-powered-by'], undefined, path);
  }
});
