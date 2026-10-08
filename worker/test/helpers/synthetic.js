// Renders a fake dashboard clip with a seven-segment gear display, so the
// whole pipeline can be tested without real footage. It adds the things that
// make real footage hard: camera shake, changing light, noise, glare and a
// hand covering the display.
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const WIDTH = 320;
const HEIGHT = 240;
const FPS = 30;
export const DURATION = 12;

const DISPLAY = { x: 220, y: 150, w: 50, h: 70 };
// The box a user would draw: the display plus a little margin for shake.
export const ROI = { x: 214, y: 144, w: 62, h: 82 };

// The gear shown from `at` seconds onwards.
export const SCRIPT = [
  { at: 0, gear: 'N' },
  { at: 1.5, gear: '1' },
  { at: 3, gear: '2' },
  { at: 4.5, gear: '3' },
  { at: 6.5, gear: '4' },
  { at: 8.5, gear: '3' },
  { at: 10, gear: '2' },
];

// Short glare flashes, and a hand over the display from 7.2 to 7.8 s.
const OCCLUSIONS = [
  { from: 5.2, to: 5.3 },
  { from: 7.2, to: 7.8 },
  { from: 9.0, to: 9.1 },
];

const EPSILON = 1e-6;
export const gearAt = (t) => SCRIPT.findLast((s) => s.at <= t + EPSILON).gear;
export const occludedAt = (t) => OCCLUSIONS.some((o) => t >= o.from - EPSILON && t < o.to - EPSILON);

// Seven-segment layout inside a 30x50 digit: [x, y, width, height].
const T = 5;
const SEGMENTS = {
  a: [3, 0, 24, T],
  b: [25, 3, T, 22],
  c: [25, 25, T, 22],
  d: [3, 45, 24, T],
  e: [0, 25, T, 22],
  f: [0, 3, T, 22],
  g: [3, 23, 24, T],
};
const DIGITS = { N: 'abcef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg' };

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fillRect(frame, x, y, w, h, value) {
  for (let yy = Math.max(0, y); yy < Math.min(HEIGHT, y + h); yy++) {
    frame.fill(value, yy * WIDTH + Math.max(0, x), yy * WIDTH + Math.min(WIDTH, x + w));
  }
}

function renderFrame(i, random) {
  const t = i / FPS;
  const frame = new Uint8ClampedArray(WIDTH * HEIGHT);
  const light = 25 * Math.sin((2 * Math.PI * t) / 4);

  for (let y = 0; y < HEIGHT; y++) {
    const stripe = 40 * Math.sin((y + i * 3) / 9);
    for (let x = 0; x < WIDTH; x++) frame[y * WIDTH + x] = 110 + stripe + x * 0.1 + light;
  }

  const ox = DISPLAY.x + Math.round(random() * 4 - 2);
  const oy = DISPLAY.y + Math.round(random() * 4 - 2);
  fillRect(frame, ox, oy, DISPLAY.w, DISPLAY.h, 30 + light);
  const lit = DIGITS[gearAt(t)];
  for (const [name, [sx, sy, sw, sh]] of Object.entries(SEGMENTS)) {
    fillRect(frame, ox + 10 + sx, oy + 10 + sy, sw, sh, lit.includes(name) ? 210 + light : 50 + light);
  }
  if (occludedAt(t)) fillRect(frame, ox - 4, oy - 4, DISPLAY.w + 8, DISPLAY.h + 8, 235);

  for (let p = 0; p < frame.length; p++) frame[p] += (random() - 0.5) * 24;
  return frame;
}

export async function writeSyntheticVideo(outPath, seed = 1) {
  const ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${WIDTH}x${HEIGHT}`, '-r', String(FPS),
    '-i', 'pipe:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23',
    outPath,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  const exited = once(ffmpeg, 'close');

  const random = mulberry32(seed);
  for (let i = 0; i < DURATION * FPS; i++) {
    if (!ffmpeg.stdin.write(renderFrame(i, random))) await once(ffmpeg.stdin, 'drain');
  }
  ffmpeg.stdin.end();
  const [code] = await exited;
  if (code !== 0) throw new Error(`ffmpeg could not encode the test video (exit code ${code})`);
}
