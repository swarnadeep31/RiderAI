# Gear reader

Reads the gear indicator from motorcycle footage filmed with a camera fixed to the bike, and produces a gear timeline
with timestamped gear changes.

No machine learning model or Python is involved. Because the camera is fixed to the bike, the gear indicator stays in
the same place in every frame. So the reader:

1. Crops the same box from 10 frames per second (FFmpeg does the decoding and cropping).
2. Compares each crop with a few labelled pictures of your display ("this is 3rd", "this is N") and picks the closest.
   The comparison ignores brightness changes and allows for a couple of pixels of camera shake.
3. Smooths the result: a gear must be visible for 3 of 5 samples to count, one-off misreads are dropped, and short
   unreadable moments (glare, your hand) are bridged when the gear is the same on both sides.
4. Reports gear changes, and flags any that skip a gear (3 → 5), since gearboxes are sequential and that usually means
   a missed reading.

## Using it on your own video

Run these from the `worker/` folder.

**1. Find the gear indicator.** Save a frame where the display is clearly visible:

```sh
npm run gear -- frame ride.mp4 --at 5 --out frame.png
```

Open `frame.png` in an image editor that shows the cursor position (Paint, GIMP, Photoshop, or Preview's
inspector on macOS). Note the top-left corner (x, y) and the width and height of a box around the gear number. Leave
a few pixels of margin around it.

**2. Save pictures to label:**

```sh
npm run gear -- samples ride.mp4 --box 820,610,60,80
```

This writes `templates/unlabeled-01.png`, `unlabeled-02.png`, ... (one picture for each different thing that appeared
in the box, most common first) and `templates/samples.json` with when each first appeared.

**3. Label them.** Rename each picture to the gear it shows: `1.png`, `2.png`, `N.png`. When several pictures show
the same gear (it's normal to get 2–3 per gear), add anything after a dash: `3.png`, `3-b.png`, `3-sunny.png`. Leave
pictures of glare, a hand or a blank display named `unlabeled-*`; they are ignored. You only do this once per bike and
camera position.

**4. Analyse:**

```sh
npm run gear -- analyze ride.mp4 --box 820,610,60,80 --out result.json
```

```
Saved result.json: 5 gear changes, 1.2s unreadable.
  00:12.0  3 -> 4  confidence 0.94
  00:18.4  4 -> 5  confidence 0.91
  ...
```

Add `--readings` to include the score for every sampled frame, which helps when tuning.

## Output

```jsonc
{
  "video": { "file": "ride.mp4", "duration": 62.1, "width": 1920, "height": 1080, "fps": 29.97 },
  "settings": { "roi": { "x": 820, "y": 610, "w": 60, "h": 80 }, "sampleFps": 10, "maxShift": 2, "minScore": 0.5, "gears": ["1", "2", "3", "N"] },
  "segments": [
    { "gear": "3", "start": 0, "end": 12, "confidence": 0.95 },
    { "gear": null, "start": 30.1, "end": 31.3, "confidence": null }   // unreadable
  ],
  "events": [
    { "timestamp": 12, "previousGear": "3", "gear": "4", "confidence": 0.94, "gapSeconds": 0, "sequential": true }
  ],
  "summary": { "gearChanges": 5, "nonSequentialChanges": 0, "timeInGear": { "3": 12, "4": 6.4 }, "unknownSeconds": 1.2 }
}
```

`gapSeconds` is how long the display was unreadable around a change. When it's above 0, the shift happened somewhere in
that gap and `timestamp` is its middle.

## Tuning

| Problem | Try |
| --- | --- |
| Lots of unreadable time | Lower `--min-score` (e.g. 0.4), or label more pictures of the display in different light |
| Wrong gear read | Label more pictures of the gears being confused; check the box isn't cutting the digit off |
| Too many pictures to label | Lower `--threshold` to 0.85 to merge more, but it may merge similar digits (2 and 3) |
| Missed quick shifts | Raise `--fps` to 15 or 20 |
| Box drifts off the digit | Larger box, or `--max-shift 3` |

## Code

```
bin/gear.js           command line
src/gear.js           findGearSamples, saveGearSamples, loadTemplates, analyzeGears
src/video/ffmpeg.js   probing, cropping frames, reading and writing images
src/cv/match.js       comparing crops (normalised cross-correlation)
src/cv/cluster.js     grouping similar crops into sample pictures
src/cv/timeline.js    smoothing readings into segments and gear-change events
test/                 unit tests and an end-to-end test on a generated dashboard clip
```

The API server's job worker will call `analyzeGears()` directly; the command line is for trying it on your own videos.
