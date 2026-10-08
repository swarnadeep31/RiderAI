#!/usr/bin/env node
// Command-line front end for the gear reader. Run `npm run gear -- help`.
import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULTS, analyzeGears, findGearSamples, parseRoi, saveGearSamples } from '../src/gear.js';
import { extractFrame } from '../src/video/ffmpeg.js';

const USAGE = `Read the gear indicator from riding footage.

  npm run gear -- frame   <video> [--at 5] [--out frame.png]
      Save one full frame so you can find the box around the gear indicator.

  npm run gear -- samples <video> --box x,y,width,height [--out templates]
      Save one picture of each different thing shown in the box, to label.

  npm run gear -- analyze <video> --box x,y,width,height [--templates templates] [--out result.json]
      Read the gear in every sampled frame and list the gear changes.

Options:
  --fps <n>          frames per second to sample (default ${DEFAULTS.fps})
  --max-shift <n>    pixels of camera shake to allow for (default ${DEFAULTS.maxShift})
  --min-score <n>    analyze: lowest match score that counts, 0-1 (default ${DEFAULTS.minScore})
  --threshold <n>    samples: how alike two crops must be to count as one (default ${DEFAULTS.clusterThreshold})
  --readings         analyze: include the per-frame readings in the output
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    at: { type: 'string', default: '1' },
    out: { type: 'string' },
    box: { type: 'string' },
    templates: { type: 'string', default: 'templates' },
    fps: { type: 'string' },
    'max-shift': { type: 'string' },
    'min-score': { type: 'string' },
    threshold: { type: 'string' },
    readings: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

function number(name) {
  if (values[name] === undefined) return undefined;
  const value = Number(values[name]);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

function box() {
  if (!values.box) throw new Error('--box x,y,width,height is required. Use the "frame" command to find it.');
  return parseRoi(values.box);
}

function showProgress(time, duration) {
  if (!process.stderr.isTTY || !duration) return;
  const percent = Math.min(100, Math.round((time / duration) * 100));
  process.stderr.write(`\r  ${time.toFixed(1)}s / ${duration.toFixed(1)}s (${percent}%)`);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

async function main() {
  const [command, video] = positionals;
  if (values.help || !command || command === 'help') {
    console.log(USAGE);
    return;
  }
  if (!video) throw new Error(`Missing <video>. Run "npm run gear -- help" for usage.`);
  try {
    await access(video);
  } catch {
    throw new Error(
      `Can't find the video "${video}" (looked for ${resolve(video)}).\n` +
        'Give the path to one of your own videos, or run "npm run demo-video" to make a test video.',
    );
  }
  const common = { fps: number('fps'), maxShift: number('max-shift'), onProgress: showProgress };

  if (command === 'frame') {
    const out = values.out ?? 'frame.png';
    await extractFrame(video, number('at'), out);
    console.log(`Saved ${out}.`);
    console.log('Open it in an image editor and note the x, y, width and height of a box around the gear indicator.');
    return;
  }

  if (command === 'samples') {
    const dir = values.out ?? 'templates';
    const samples = await findGearSamples(video, { ...common, roi: box(), threshold: number('threshold') });
    const index = await saveGearSamples(dir, samples);
    process.stderr.write('\n');
    console.log(`Saved ${index.length} pictures to ${dir}/ (most common first):`);
    for (const s of index) console.log(`  ${s.file}  ${s.frames} frames, first at ${formatTime(s.firstSeen)}`);
    console.log('\nRename each picture to the gear it shows: 1.png, 2.png, N.png ...');
    console.log('If two pictures show the same gear, name them 3.png and 3-b.png.');
    console.log('Leave pictures of glare, a hand or a blank display as they are; unlabeled-* files are ignored.');
    return;
  }

  if (command === 'analyze') {
    const result = await analyzeGears(video, {
      ...common,
      roi: box(),
      templatesDir: values.templates,
      minScore: number('min-score'),
      includeReadings: values.readings,
    });
    process.stderr.write('\n');
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (!values.out) {
      process.stdout.write(json);
      return;
    }
    await writeFile(values.out, json);
    const { summary, events } = result;
    console.log(`Saved ${values.out}: ${summary.gearChanges} gear changes, ${summary.unknownSeconds}s unreadable.`);
    for (const e of events) {
      const warning = e.sequential === false ? '  (skipped a gear: probably a missed reading)' : '';
      console.log(`  ${formatTime(e.timestamp)}  ${e.previousGear} -> ${e.gear}  confidence ${e.confidence}${warning}`);
    }
    return;
  }

  throw new Error(`Unknown command "${command}". Run "npm run gear -- help" for usage.`);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
