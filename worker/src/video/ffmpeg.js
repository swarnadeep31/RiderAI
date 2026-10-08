// Thin wrappers around the ffmpeg and ffprobe command-line tools.
// Set FFMPEG_PATH / FFPROBE_PATH if they are not on your PATH.
import { spawn } from 'node:child_process';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

function spawnTool(cmd, args, stdin) {
  const proc = spawn(cmd, args, { stdio: [stdin, 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (text) => {
    stderr = (stderr + text).slice(-4000);
  });
  const done = new Promise((resolve, reject) => {
    proc.on('error', (err) => {
      if (err.code !== 'ENOENT') return reject(err);
      const envVar = cmd === FFPROBE ? 'FFPROBE_PATH' : 'FFMPEG_PATH';
      reject(new Error(`${cmd} was not found. Install FFmpeg or set ${envVar}.`));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} failed (exit code ${code}): ${stderr.trim()}`));
    });
  });
  return { proc, done };
}

async function run(cmd, args, input) {
  const { proc, done } = spawnTool(cmd, args, input ? 'pipe' : 'ignore');
  const chunks = [];
  proc.stdout.on('data', (chunk) => chunks.push(chunk));
  if (input) {
    // A write error here means the process died; `done` reports why.
    proc.stdin.on('error', () => {});
    proc.stdin.end(input);
  }
  await done;
  return Buffer.concat(chunks);
}

function parseRate(rate) {
  const [num, den] = String(rate).split('/').map(Number);
  return den ? num / den : num || 0;
}

export async function probeVideo(videoPath) {
  const out = await run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_streams', '-show_format',
    '-of', 'json',
    videoPath,
  ]);
  const info = JSON.parse(out.toString('utf8'));
  const stream = info.streams?.[0];
  if (!stream) throw new Error(`${videoPath} has no video stream`);

  // Phone videos are often stored sideways with a rotation flag. ffmpeg
  // applies the rotation when decoding, so report the size as displayed.
  const rotation = Number(
    stream.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? stream.tags?.rotate ?? 0,
  );
  const sideways = Math.abs(rotation) % 180 === 90;

  return {
    width: sideways ? stream.height : stream.width,
    height: sideways ? stream.width : stream.height,
    duration: Number(stream.duration ?? info.format?.duration) || 0,
    fps: parseRate(stream.avg_frame_rate) || parseRate(stream.r_frame_rate),
    codec: stream.codec_name,
  };
}

// Yields the region of interest from `fps` frames per second as small
// grayscale images: { index, time, pixels } with pixels.length === w * h.
export async function* readCrops(videoPath, { roi, size, fps }) {
  const filters = [
    `fps=${fps}`,
    `crop=${roi.w}:${roi.h}:${roi.x}:${roi.y}`,
    `scale=${size.w}:${size.h}:flags=area`,
    'format=gray',
  ].join(',');
  const { proc, done } = spawnTool(FFMPEG, [
    '-v', 'error',
    '-i', videoPath,
    '-vf', filters,
    '-an',
    '-f', 'rawvideo', '-pix_fmt', 'gray',
    'pipe:1',
  ], 'ignore');

  const frameBytes = size.w * size.h;
  let pending = Buffer.alloc(0);
  let index = 0;
  let finished = false;
  try {
    for await (const chunk of proc.stdout) {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= frameBytes) {
        yield { index, time: index / fps, pixels: new Uint8Array(pending.subarray(0, frameBytes)) };
        pending = pending.subarray(frameBytes);
        index += 1;
      }
    }
    await done;
    finished = true;
  } finally {
    // The caller stopped early or something failed: don't leave ffmpeg running.
    if (!finished) {
      done.catch(() => {});
      proc.kill();
    }
  }
}

// Loads any image ffmpeg can read as grayscale pixels at the given size.
export async function decodeImage(imagePath, size) {
  const out = await run(FFMPEG, [
    '-v', 'error',
    '-i', imagePath,
    '-vf', `scale=${size.w}:${size.h}:flags=area,format=gray`,
    '-frames:v', '1',
    '-f', 'rawvideo', '-pix_fmt', 'gray',
    'pipe:1',
  ]);
  if (out.length !== size.w * size.h) throw new Error(`Could not read ${imagePath} as an image`);
  return new Uint8Array(out);
}

// Saves grayscale pixels as a PNG, enlarged `scale` times so it is easy to look at.
export async function writeImage(outPath, pixels, size, scale = 1) {
  await run(FFMPEG, [
    '-v', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${size.w}x${size.h}`,
    '-i', 'pipe:0',
    '-vf', `scale=iw*${scale}:ih*${scale}:flags=neighbor`,
    '-frames:v', '1', '-update', '1',
    outPath,
  ], Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength));
}

// Saves the full frame at `seconds` as an image.
export async function extractFrame(videoPath, seconds, outPath) {
  await run(FFMPEG, [
    '-v', 'error', '-y',
    '-ss', String(seconds),
    '-i', videoPath,
    '-frames:v', '1', '-update', '1',
    outPath,
  ]);
}
