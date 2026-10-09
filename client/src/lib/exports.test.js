// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { parseGpx } from './gpx.js';
import { fileNameFor, googleMapsUrl, toGpx, toKml, youtubeUrlAt } from './exports.js';

const trail = {
  title: 'Spiti <loop> & back',
  youtubeId: 'aBcD3fGh1_-',
  recordedAt: '2026-03-12T06:00:00.000Z',
  track: [
    [32.1, 77.1],
    [32.2, 77.2],
  ],
  trackTimes: [0, 30],
  points: [{ name: 'Tea "stall"', note: 'Try the momos', time: 75.6, lat: 32.15, lng: 77.15 }],
};

test('links', () => {
  expect(googleMapsUrl(32.15, 77.15)).toBe('https://www.google.com/maps/search/?api=1&query=32.15,77.15');
  expect(youtubeUrlAt('aBcD3fGh1_-', 75.6)).toBe('https://youtu.be/aBcD3fGh1_-?t=75');
});

describe('toGpx', () => {
  test('includes key points, the route and its times, safely escaped', () => {
    const xml = toGpx(trail);
    expect(xml).toContain('<name>Spiti &lt;loop&gt; &amp; back</name>');
    expect(xml).toContain('<wpt lat="32.15" lon="77.15">');
    expect(xml).toContain('<name>Tea &quot;stall&quot;</name>');
    expect(xml).toContain('<trkpt lat="32.2" lon="77.2"><time>2026-03-12T06:00:30.000Z</time></trkpt>');
  });

  test('can be read back as GPX', () => {
    const back = parseGpx(toGpx(trail));
    expect(back.track).toEqual(trail.track);
    expect(back.trackTimes).toEqual(trail.trackTimes);
  });

  test('leaves out times the trail does not have', () => {
    expect(toGpx({ ...trail, trackTimes: [], recordedAt: null })).not.toContain('<time>');
  });
});

test('toKml writes longitude before latitude', () => {
  const kml = toKml(trail);
  expect(kml).toContain('<Point><coordinates>77.15,32.15</coordinates></Point>');
  expect(kml).toContain('<coordinates>77.1,32.1 77.2,32.2</coordinates>');
  expect(kml).toContain('Watch: https://youtu.be/aBcD3fGh1_-?t=75');
  expect(new DOMParser().parseFromString(kml, 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
});

test('fileNameFor', () => {
  expect(fileNameFor('Manali to Rohtang!', 'gpx')).toBe('manali-to-rohtang.gpx');
  expect(fileNameFor('!!!', 'kml')).toBe('trail.kml');
});
