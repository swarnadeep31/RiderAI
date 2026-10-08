# RiderAI

Upload a riding video and get back a timestamped analysis of the ride: which gear you were in, when you shifted, and
(later) more riding events.

Built with the MERN stack (MongoDB, Express, React, Node.js). The video analysis is plain JavaScript plus FFmpeg, so
there is no Python to set up or learn.

## Status

| Phase | What | State |
| --- | --- | --- |
| 0 | Gear reader: read the gear indicator from dash-mounted footage | Done (`worker/`) |
| 1 | MERN skeleton: Express API, MongoDB, React app | Next |
| 2 | Upload (drag and drop), convert to H.264 for playback, play back | |
| 3 | Job queue (Redis + BullMQ): the worker runs the gear reader on uploads | |
| 4 | Results page: player, gear timeline, list of gear changes | |
| 5 | Draw the box around the gear indicator in the browser and label the sample pictures | |
| 6 | Accounts, history, adding videos by URL | |
| 7 | AI explanations and questions about a ride | |

## Layout

```
worker/   Video processing (Node.js + FFmpeg). Today: the gear reader and its command line.
client/   React app (coming in phase 1)
server/   Express API (coming in phase 1)
```

## Requirements

- Node.js 20 or newer
- FFmpeg (`ffmpeg` and `ffprobe` on your PATH, or set `FFMPEG_PATH` and `FFPROBE_PATH`)
  - Windows: `winget install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`

## Try the gear reader

See [worker/README.md](worker/README.md). In short:

```sh
cd worker
npm test                                                # check everything works
npm run gear -- frame ride.mp4 --at 5                   # find where the gear indicator is
npm run gear -- samples ride.mp4 --box 820,610,60,80    # save pictures to label
npm run gear -- analyze ride.mp4 --box 820,610,60,80 --out result.json
```

## What footage works

The camera must be fixed to the bike (tank or handlebar mount) with the gear indicator in view. Footage that only
shows the rider from outside, or from a helmet or chest camera that moves relative to the dashboard, won't work for
gear reading. Motorcycles only for now: bicycles have no gear display to read.
