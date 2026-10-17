// Prepares a video file on this computer for Gemini with FFmpeg: optionally
// drops the sound, and makes the file small (lower resolution and frame rate)
// so it uploads quickly. Gemini looks at about 1 frame a second anyway.
import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
    child.on('error', (err) =>
      reject(err.code === 'ENOENT' ? new Error(`${command} is not installed. Install FFmpeg from https://ffmpeg.org/download.html`) : err),
    );
    child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`${command} failed: ${stderr.trim().split('\n').at(-1)}`))));
  });
}

export async function hasFfmpeg() {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

// Length, picture size and whether the file has sound.
export async function probeVideo(path) {
  let info;
  try {
    info = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path]));
  } catch (err) {
    if (/not installed/.test(err.message)) throw err;
    throw new Error(`${path} isn't a video file FFmpeg can read.`);
  }
  const video = info.streams.find((s) => s.codec_type === 'video');
  if (!video) throw new Error(`${path} has no video in it.`);
  return {
    durationSec: Number(info.format.duration) || 0,
    width: video.width,
    height: video.height,
    hasAudio: info.streams.some((s) => s.codec_type === 'audio'),
    sizeBytes: Number(info.format.size) || 0,
  };
}

// Only part of the file: from `start` to `end` seconds (the whole file without them).
const partArgs = ({ start, end } = {}) => [...(start ? ['-ss', String(start)] : []), ...(end ? ['-to', String(end)] : [])];

// Writes a smaller copy of `input` to `output` (an .mp4).
// noAudio: leave the sound out. maxHeight: e.g. 480 lines. fps: frames kept per second.
// start, end: only that part of the video, in seconds (the copy then starts at 0).
export async function prepareVideo(input, output, { noAudio = false, maxHeight = 480, fps = 1, start, end } = {}) {
  const args = ['-y', '-v', 'error', ...partArgs({ start, end }), '-i', input];
  args.push('-vf', `fps=${fps},scale=-2:'min(${maxHeight},ih)'`);
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p');
  if (noAudio) args.push('-an');
  else args.push('-c:a', 'aac', '-b:a', '64k', '-ac', '1');
  args.push('-movflags', '+faststart', output);
  await run('ffmpeg', args);
  return probeVideo(output);
}

// Writes just the sound of `input` to `output` (an .m4a): mono speech
// quality, which is all Gemini needs to hear what's said, and much cheaper to
// send than the picture. start, end: only that part, in seconds.
export async function extractSound(input, output, { start, end } = {}) {
  const args = ['-y', '-v', 'error', ...partArgs({ start, end }), '-i', input, '-vn', '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-ar', '16000', output];
  await run('ffmpeg', args);
}
