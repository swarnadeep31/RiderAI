import assert from 'node:assert/strict';
import { test } from 'node:test';
import { concurrencyLimit } from '../src/utils/limit.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('runs at most so many tasks at once, and the rest in turn', async () => {
  const limit = concurrencyLimit(2);
  let atOnce = 0;
  let most = 0;
  const task = async (value) => {
    atOnce += 1;
    most = Math.max(most, atOnce);
    await tick();
    atOnce -= 1;
    return value;
  };
  const results = await Promise.all([1, 2, 3, 4, 5].map((n) => limit.run(() => task(n))));
  assert.deepEqual(results, [1, 2, 3, 4, 5]);
  assert.equal(most, 2);
  assert.deepEqual([limit.running, limit.waiting], [0, 0]);
});

test('a failed task frees its place', async () => {
  const limit = concurrencyLimit(1);
  await assert.rejects(limit.run(async () => { throw new Error('nope'); }), /nope/);
  assert.equal(await limit.run(async () => 'next'), 'next');
});

test('turns tasks away (503) when too many are waiting', async () => {
  const limit = concurrencyLimit(1, { maxWaiting: 1 });
  const first = limit.run(tick);
  const second = limit.run(tick);
  await assert.rejects(limit.run(tick), (err) => err.status === 503);
  await Promise.all([first, second]);
});
