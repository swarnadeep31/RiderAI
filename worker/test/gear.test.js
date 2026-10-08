import assert from 'node:assert/strict';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyzeGears, findGearSamples, saveGearSamples } from '../src/gear.js';
import { ROI, SCRIPT, gearAt, occludedAt, writeSyntheticVideo } from './helpers/synthetic.js';

test('reads every gear change from a shaky, noisy dashboard clip', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'riderai-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const video = join(dir, 'ride.mp4');
  await writeSyntheticVideo(video);

  // Label the sample pictures the way a user would, using what the clip
  // actually showed when each picture first appeared.
  const templatesDir = join(dir, 'templates');
  const index = await saveGearSamples(templatesDir, await findGearSamples(video, { roi: ROI }));
  const labelled = new Set();
  for (const sample of index) {
    if (occludedAt(sample.firstSeen)) continue;
    const gear = gearAt(sample.firstSeen);
    labelled.add(gear);
    await rename(join(templatesDir, sample.file), join(templatesDir, `${gear}-${sample.file}`));
  }
  assert.deepEqual([...labelled].sort(), [...new Set(SCRIPT.map((s) => s.gear))].sort());

  const result = await analyzeGears(video, { roi: ROI, templatesDir });

  const expected = SCRIPT.slice(1).map((step, i) => ({
    timestamp: step.at,
    previousGear: SCRIPT[i].gear,
    gear: step.gear,
  }));
  const found = result.events.map(({ timestamp, previousGear, gear }) => ({ timestamp, previousGear, gear }));
  assert.equal(found.length, expected.length, `events: ${JSON.stringify(found)}`);
  for (const [i, event] of found.entries()) {
    assert.equal(event.previousGear, expected[i].previousGear);
    assert.equal(event.gear, expected[i].gear);
    assert.ok(
      Math.abs(event.timestamp - expected[i].timestamp) <= 0.15,
      `${event.previousGear} -> ${event.gear} at ${event.timestamp}s, expected ${expected[i].timestamp}s`,
    );
  }
  assert.ok(result.events.every((e) => e.sequential === true && e.confidence > 0.8));

  // The hand over the display at 7.2-7.8 s must not split 4th gear in two.
  const fourth = result.segments.filter((s) => s.gear === '4');
  assert.equal(fourth.length, 1);
  assert.ok(Math.abs(fourth[0].start - 6.5) <= 0.15 && Math.abs(fourth[0].end - 8.5) <= 0.15);
});
