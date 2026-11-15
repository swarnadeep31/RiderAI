import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startKeepAwake } from '../src/keepAwake.js';
import { startFakeService } from './helpers.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('on Render, the server visits its own health check again and again, through its public address', async () => {
  const render = await startFakeService(() => [200, { ok: true }]);
  try {
    const stop = startKeepAwake({ url: render.url, intervalMs: 30 });
    // Wait (up to 10 s, the tests run side by side) for a few visits.
    for (let waited = 0; render.requests.length < 3 && waited < 10000; waited += 20) await sleep(20);
    stop();
    assert.ok(render.requests.length >= 3, `${render.requests.length} visits`);
    assert.ok(render.requests.every((r) => r.url === '/api/health'));
    // Once stopped (and any visit on its way has arrived), no more.
    await sleep(500);
    const visits = render.requests.length;
    await sleep(300);
    assert.equal(render.requests.length, visits, 'stopped');
  } finally {
    await render.close();
  }
});

test('elsewhere (no public address), or switched off, it does nothing', async () => {
  const render = await startFakeService(() => [200, { ok: true }]);
  try {
    startKeepAwake({ url: undefined, intervalMs: 10 })();
    process.env.KEEP_AWAKE = 'off';
    const stop = startKeepAwake({ url: render.url, intervalMs: 10 });
    await sleep(50);
    stop();
    assert.equal(render.requests.length, 0);
  } finally {
    delete process.env.KEEP_AWAKE;
    await render.close();
  }
});
