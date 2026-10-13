import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { hasFfmpeg, prepareVideo, probeVideo } from '../src/services/videoFile.js';

const ffmpeg = await hasFfmpeg();
const skip = ffmpeg ? false : 'FFmpeg is not installed';

let dir;
let ride;
before(async () => {
  if (!ffmpeg) return;
  dir = await mkdtemp(join(tmpdir(), 'trailcast-video-'));
  ride = join(dir, 'ride.mp4');
  // A 4-second 1280x720 test video at 30 frames a second, with a beep as its sound.
  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', ride,
  ]);
});
after(() => dir && rm(dir, { recursive: true, force: true }));

test('reads a video file: length, size and whether it has sound', { skip }, async () => {
  const info = await probeVideo(ride);
  assert.ok(Math.abs(info.durationSec - 4) < 0.2);
  assert.equal(info.height, 720);
  assert.equal(info.hasAudio, true);
});

test('makes a smaller copy without sound, keeping the timing', { skip }, async () => {
  const out = join(dir, 'small.mp4');
  const info = await prepareVideo(ride, out, { noAudio: true, maxHeight: 240 });
  assert.equal(info.hasAudio, false);
  assert.equal(info.height, 240);
  assert.equal(info.width, 426);
  assert.ok(Math.abs(info.durationSec - 4) < 1.1, `duration ${info.durationSec}`);
  assert.ok(info.sizeBytes < (await probeVideo(ride)).sizeBytes);
});

test('keeps the sound unless asked not to, and never makes the picture bigger', { skip }, async () => {
  const out = join(dir, 'with-sound.mp4');
  const info = await prepareVideo(ride, out, { maxHeight: 1080 });
  assert.equal(info.hasAudio, true);
  assert.equal(info.height, 720);
});

test('explains a file that is not a video', { skip }, async () => {
  await assert.rejects(probeVideo(join(dir, 'missing.mp4')), /ffprobe failed/);
});
