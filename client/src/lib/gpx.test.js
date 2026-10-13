// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { MAX_TRACK_POINTS, parseGpx } from './gpx.js';

const gpx = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;

describe('parseGpx', () => {
  test('reads a recorded track with times', () => {
    const result = parseGpx(
      gpx(`<metadata><name>Morning ride</name></metadata>
        <trk><trkseg>
          <trkpt lat="32.2432" lon="77.1892"><ele>2050</ele><time>2026-03-12T06:00:00Z</time></trkpt>
          <trkpt lat="32.2500" lon="77.1900"><time>2026-03-12T06:00:05Z</time></trkpt>
          <trkpt lat="32.2600" lon="77.1950"><time>2026-03-12T06:01:00Z</time></trkpt>
        </trkseg></trk>`),
    );
    expect(result).toEqual({
      name: 'Morning ride',
      track: [
        [32.2432, 77.1892],
        [32.25, 77.19],
        [32.26, 77.195],
      ],
      trackTimes: [0, 5, 60],
      recordedAt: '2026-03-12T06:00:00.000Z',
    });
  });

  test('a route without times still gives a line, but no times', () => {
    const result = parseGpx(
      gpx(`<rte><name>Planned</name>
        <rtept lat="46.5" lon="8.0" /><rtept lat="46.6" lon="8.1" />
      </rte>`),
    );
    expect(result.track).toEqual([
      [46.5, 8],
      [46.6, 8.1],
    ]);
    expect(result.trackTimes).toEqual([]);
    expect(result.recordedAt).toBeNull();
  });

  test('ignores times if any point is missing one', () => {
    const result = parseGpx(
      gpx(`<trk><trkseg>
        <trkpt lat="1" lon="1"><time>2026-01-01T00:00:00Z</time></trkpt>
        <trkpt lat="2" lon="2" />
      </trkseg></trk>`),
    );
    expect(result.trackTimes).toEqual([]);
  });

  test('skips points with impossible coordinates', () => {
    const result = parseGpx(
      gpx(`<trk><trkseg>
        <trkpt lat="1" lon="1" /><trkpt lat="999" lon="1" /><trkpt lat="2" lon="2" />
      </trkseg></trk>`),
    );
    expect(result.track).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  test('thins out very long recordings, keeping the start and end', () => {
    const points = Array.from({ length: 21 }, (_, i) => `<trkpt lat="${i}" lon="0" />`);
    const result = parseGpx(gpx(`<trk><trkseg>${points.join('')}</trkseg></trk>`), { maxPoints: 11 });
    expect(result.track.map(([lat]) => lat)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(MAX_TRACK_POINTS).toBe(20000); // must match the server's limit
  });

  test('explains files it cannot use', () => {
    expect(() => parseGpx('not xml at all <')).toThrow(/valid GPX/);
    expect(() => parseGpx(gpx('<trk><trkseg><trkpt lat="1" lon="1" /></trkseg></trk>'))).toThrow(/No route/);
  });
});
