import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { extractSound, hasFfmpeg, prepareVideo, probeVideo, runTool } from '../src/services/videoFile.js';

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
  await assert.rejects(probeVideo(join(dir, 'missing.mp4')), /isn't a video file FFmpeg can read/);
});

test('can copy just one part of the video, starting at 0', { skip }, async () => {
  const out = join(dir, 'part.mp4');
  const info = await prepareVideo(ride, out, { start: 1, end: 3 });
  assert.ok(Math.abs(info.durationSec - 2) < 1.1, `duration ${info.durationSec}`);
});

test('extracts just the sound, for listening to what is said', { skip }, async () => {
  const out = join(dir, 'sound.m4a');
  await extractSound(ride, out, { start: 1 });
  const streams = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', out], { encoding: 'utf8' }));
  assert.deepEqual(streams.streams.map((stream) => stream.codec_type), ['audio']);
  assert.equal(streams.streams[0].channels, 1);
  assert.ok(Math.abs(Number(streams.format.duration) - 3) < 0.3, `duration ${streams.format.duration}`);
});

test('a playlist dressed up as a video is refused, so FFmpeg never follows its links', { skip }, async () => {
  const playlist = join(dir, 'playlist.video');
  await writeFile(playlist, '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:9/segment.ts\n#EXT-X-ENDLIST\n');
  await assert.rejects(probeVideo(playlist), /isn't a video file/);
  await assert.rejects(prepareVideo(playlist, join(dir, 'out.mp4')), /ffmpeg failed/);
});

test('a tool that runs too long is stopped', async () => {
  const startedAt = Date.now();
  await assert.rejects(runTool(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 200 }), /took too long/);
  assert.ok(Date.now() - startedAt < 5000);
});
