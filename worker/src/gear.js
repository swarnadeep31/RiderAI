// Reads the gear indicator from riding footage.
//
// 1. findGearSamples + saveGearSamples: crop the indicator from every sampled
//    frame and save one picture per distinct look, for the user to label.
// 2. analyzeGears: compare every crop with the labelled pictures and turn the
//    matches into a gear timeline with timestamped gear changes.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { decodeImage, probeVideo, readCrops, writeImage } from './video/ffmpeg.js';
import { classify } from './cv/match.js';
import { Clusterer } from './cv/cluster.js';
import { buildTimeline } from './cv/timeline.js';

export const DEFAULTS = {
  fps: 10, // gears can change in well under a second
  maxShift: 2, // pixels of camera shake to tolerate, at analysis size
  minScore: 0.5, // below this a crop counts as unreadable
  clusterThreshold: 0.9, // how alike two crops must be to share a sample picture
  minClusterSize: 3, // ignore looks that appear in fewer frames than this
};

const ANALYSIS_LONG_SIDE = 48;
const PREVIEW_SCALE = 4;
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

export function parseRoi(text) {
  const parts = String(text).split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0) || !parts[2] || !parts[3]) {
    throw new Error(`Box must be "x,y,width,height" in whole pixels, e.g. 820,610,60,80 (got "${text}")`);
  }
  const [x, y, w, h] = parts;
  return { x, y, w, h };
}

// Crops are shrunk to a fixed size so matching speed doesn't depend on the
// video resolution.
export function analysisSize(roi) {
  const scale = ANALYSIS_LONG_SIDE / Math.max(roi.w, roi.h);
  return { w: Math.max(8, Math.round(roi.w * scale)), h: Math.max(8, Math.round(roi.h * scale)) };
}

async function openVideo(videoPath, roi, fps) {
  const video = await probeVideo(videoPath);
  if (roi.x + roi.w > video.width || roi.y + roi.h > video.height) {
    throw new Error(
      `Box ${roi.x},${roi.y},${roi.w},${roi.h} goes outside the ${video.width}x${video.height} video frame`,
    );
  }
  return { video, sampleFps: video.fps ? Math.min(fps, video.fps) : fps };
}

export async function findGearSamples(videoPath, options) {
  const {
    roi,
    fps = DEFAULTS.fps,
    maxShift = DEFAULTS.maxShift,
    threshold = DEFAULTS.clusterThreshold,
    minCount = DEFAULTS.minClusterSize,
    onProgress,
  } = options;
  const { video, sampleFps } = await openVideo(videoPath, roi, fps);
  const size = analysisSize(roi);
  const clusterer = new Clusterer(size, { threshold, maxShift });
  for await (const crop of readCrops(videoPath, { roi, size, fps: sampleFps })) {
    clusterer.add(crop);
    onProgress?.(crop.time, video.duration);
  }
  const clusters = clusterer.clusters.filter((c) => c.count >= minCount).sort((a, b) => b.count - a.count);
  return { size, clusters };
}

// Writes unlabeled-01.png, unlabeled-02.png, ... (most common look first) and
// samples.json, which says how often and when each look appeared.
export async function saveGearSamples(dir, { size, clusters }) {
  await mkdir(dir, { recursive: true });
  const index = [];
  for (const [i, cluster] of clusters.entries()) {
    const file = `unlabeled-${String(i + 1).padStart(2, '0')}.png`;
    await writeImage(join(dir, file), cluster.pixels, size, PREVIEW_SCALE);
    index.push({ file, frames: cluster.count, firstSeen: round(cluster.firstSeen), lastSeen: round(cluster.lastSeen) });
  }
  await writeFile(join(dir, 'samples.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

// Templates are PNGs named after the gear they show: 3.png, N.png. Extra
// pictures of the same gear go after a dash: 3-glare.png, 3-b.png.
const TEMPLATE_FILE = /^([^-.]+)(?:-[^.]*)?\.png$/i;

export async function loadTemplates(dir, size) {
  const templates = [];
  for (const file of (await readdir(dir)).sort()) {
    const match = TEMPLATE_FILE.exec(file);
    if (!match || file.startsWith('unlabeled-')) continue;
    templates.push({ gear: match[1].toUpperCase(), file, pixels: await decodeImage(join(dir, file), size) });
  }
  if (templates.length === 0) {
    throw new Error(
      `No labelled pictures in ${dir}. Rename each unlabeled-XX.png to the gear it shows, e.g. 3.png or N.png.`,
    );
  }
  return templates;
}

export async function analyzeGears(videoPath, options) {
  const {
    roi,
    templatesDir,
    fps = DEFAULTS.fps,
    maxShift = DEFAULTS.maxShift,
    minScore = DEFAULTS.minScore,
    includeReadings = false,
    onProgress,
  } = options;
  const { video, sampleFps } = await openVideo(videoPath, roi, fps);
  const size = analysisSize(roi);
  const templates = await loadTemplates(templatesDir, size);

  const readings = [];
  for await (const crop of readCrops(videoPath, { roi, size, fps: sampleFps })) {
    const { gear, score } = classify(crop.pixels, templates, size, { maxShift, minScore });
    readings.push({ time: round(crop.time), gear, score: round(score, 3) });
    onProgress?.(crop.time, video.duration);
  }
  if (readings.length === 0) throw new Error(`No frames could be read from ${videoPath}`);

  return {
    video: {
      file: basename(videoPath),
      duration: round(video.duration),
      width: video.width,
      height: video.height,
      fps: round(video.fps),
    },
    settings: { roi, sampleFps, maxShift, minScore, gears: [...new Set(templates.map((t) => t.gear))] },
    ...buildTimeline(readings, { fps: sampleFps }),
    ...(includeReadings && { readings }),
  };
}
