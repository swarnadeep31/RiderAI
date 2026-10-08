import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTimeline } from '../src/cv/timeline.js';

const FPS = 10;

// timeline('3', 10, null, 2, '4', 10) -> readings at 10 fps: ten 3s, two unreadable, ten 4s.
function timeline(...parts) {
  const labels = [];
  for (let i = 0; i < parts.length; i += 2) labels.push(...Array(parts[i + 1]).fill(parts[i]));
  const readings = labels.map((gear, i) => ({ time: i / FPS, gear, score: gear ? 0.9 : 0.1 }));
  return buildTimeline(readings, { fps: FPS });
}

test('a single misread frame is ignored', () => {
  const result = timeline('3', 10, '5', 1, '3', 10);
  assert.equal(result.events.length, 0);
  assert.deepEqual(result.segments.map((s) => s.gear), ['3']);
});

test('a gear change is timestamped where the new gear first appears', () => {
  const { events } = timeline('3', 10, '4', 10);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    timestamp: 1,
    previousGear: '3',
    gear: '4',
    confidence: 0.9,
    gapSeconds: 0,
    sequential: true,
  });
});

test('skipping a gear is flagged as a likely missed reading', () => {
  const result = timeline('3', 10, '5', 10);
  assert.equal(result.events[0].sequential, false);
  assert.equal(result.summary.nonSequentialChanges, 1);
});

test('neutral sits between first and second', () => {
  const { events } = timeline('1', 10, 'N', 10, '2', 10, '1', 10);
  assert.deepEqual(events.map((e) => e.sequential), [true, true, true]);
});

test('labels that are not gears are not judged', () => {
  const { events } = timeline('3', 10, 'LIMITER', 10);
  assert.equal(events[0].sequential, null);
});

test('a short unreadable stretch inside one gear is bridged', () => {
  const result = timeline('4', 10, null, 6, '4', 10);
  assert.equal(result.events.length, 0);
  assert.deepEqual(result.segments.map((s) => s.gear), ['4']);
  assert.equal(result.summary.unknownSeconds, 0);
});

test('a long unreadable stretch is reported as unknown', () => {
  const result = timeline('4', 10, null, 20, '4', 10);
  assert.equal(result.events.length, 0);
  assert.deepEqual(result.segments.map((s) => s.gear), ['4', null, '4']);
  assert.equal(result.summary.unknownSeconds, 2);
});

test('a change hidden by an unreadable stretch is placed in the middle of it', () => {
  const { events } = timeline('2', 10, null, 20, '3', 10);
  assert.equal(events.length, 1);
  assert.equal(events[0].timestamp, 2);
  assert.equal(events[0].gapSeconds, 2);
});
