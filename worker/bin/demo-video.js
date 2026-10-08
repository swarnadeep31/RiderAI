#!/usr/bin/env node
// Makes a 12-second fake dashboard clip, so the gear commands can be tried
// without your own footage. Run `npm run demo-video`.
import { ROI, writeSyntheticVideo } from '../test/helpers/synthetic.js';

const out = process.argv[2] ?? 'demo.mp4';
const box = `${ROI.x},${ROI.y},${ROI.w},${ROI.h}`;

try {
  await writeSyntheticVideo(out);
  console.log(`Saved ${out}: a fake dashboard whose gear display goes N, 1, 2, 3, 4, 3, 2.`);
  console.log('\nTry the gear reader on it:');
  console.log(`  npm run gear -- frame ${out} --at 5`);
  console.log(`  npm run gear -- samples ${out} --box ${box}`);
  console.log('  (rename the pictures in templates/ to the gear they show: 1.png, 2.png, N.png ...)');
  console.log(`  npm run gear -- analyze ${out} --box ${box} --out result.json`);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
}
