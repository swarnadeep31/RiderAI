import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { pinTripEnds, tripArea, tripKey, tripOf } from '../src/aiRoute/trip.js';

const KOLKATA = { name: 'Kolkata', label: 'Kolkata, West Bengal, India', lat: 22.5726, lng: 88.3639 };
const DEHRI = { name: 'Dehri', label: 'Dehri, Rohtas, Bihar, India', lat: 24.9, lng: 84.18 };
const LEH = { name: 'Leh', label: 'Leh, Ladakh, India', lat: 34.1526, lng: 77.5771 };

const place = (name, time, extra = {}) => ({
  id: name,
  name,
  time,
  stayUntil: null,
  stopKind: null,
  presence: 'here',
  evidence: 'sign',
  quote: '',
  confidence: 0.9,
  flags: [],
  checked: true,
  lat: null,
  lng: null,
  ...extra,
});
const names = (candidates) => candidates.map((c) => [c.name, c.time, c.checked, c.anchor ?? null]);

describe('the trip from the video title', () => {
  test('tripOf takes only complete places, and tripKey tells trips apart', () => {
    const trip = tripOf({ videoTitle: ' Kolkata to Dehri | EP1 ', startPlace: KOLKATA, endPlace: { name: 'Dehri' } });
    assert.deepEqual(trip, { title: 'Kolkata to Dehri | EP1', start: KOLKATA, end: null });
    assert.equal(tripKey(trip), 'kolkata@22.573,88.364>');
    assert.equal(tripKey(tripOf({ startPlace: KOLKATA, endPlace: DEHRI })), 'kolkata@22.573,88.364>dehri@24.900,84.180');
    assert.equal(tripKey(tripOf({})), '');
  });

  test('the places are looked for in a box around the start and end', () => {
    // Kolkata to Leh: a quarter of the trip's size around it, at most 3°.
    const area = tripArea({ start: KOLKATA, end: LEH });
    assert.ok(Math.abs(area.west - (77.5771 - 2.89)) < 0.01);
    assert.ok(Math.abs(area.north - (34.1526 + 2.89)) < 0.01);
    // Islamabad and northern Pakistan are outside it, Srinagar and Nepal inside.
    const inside = ([lat, lng]) => lat >= area.south && lat <= area.north && lng >= area.west && lng <= area.east;
    assert.equal(inside([33.515, 73.179]), false);
    assert.equal(inside([35.058, 72.534]), false);
    assert.equal(inside([34.08, 74.8]), true);
    // A short trip still gets 1.5° around it; a round trip none.
    assert.equal(tripArea({ start: KOLKATA, end: DEHRI }).south, 22.5726 - 1.5);
    assert.equal(tripArea({ start: KOLKATA, end: { ...KOLKATA, lat: 22.6 } }), null);
    assert.equal(tripArea({ start: KOLKATA, end: null }), null);
  });
});

describe('pinTripEnds', () => {
  test('without a start or end, nothing changes', () => {
    const answer = { candidates: [place('Asansol', 600)], hiddenRanges: [] };
    assert.deepEqual(pinTripEnds(answer, { title: 'x', start: null, end: null }, 1800), answer);
  });

  test('the route starts when the ride sets off, and the part before it is the intro', () => {
    const { candidates, hiddenRanges } = pinTripEnds(
      {
        candidates: [place('Howrah Bridge', 120, { presence: 'mentioned', checked: false }), place('Durgapur', 200), place('Asansol', 900)],
        hiddenRanges: [{ start: 0, end: 60, reason: 'intro' }],
        startTime: 318,
        endTime: null,
      },
      { start: KOLKATA, end: DEHRI },
      1800,
    );
    assert.deepEqual(names(candidates), [
      ['Howrah Bridge', 120, false, null],
      // Ticked, but before the ride sets off: unticked, and the reviewer is told why.
      ['Durgapur', 200, false, null],
      ['Kolkata', 318, true, 'start'],
      ['Asansol', 900, true, null],
      // No arrival seen: the end is where the video ends.
      ['Dehri', 1800, true, 'end'],
    ]);
    assert.deepEqual(candidates[1].flags, ['before_start']);
    assert.deepEqual([candidates[2].lat, candidates[2].lng, candidates[2].label], [KOLKATA.lat, KOLKATA.lng, KOLKATA.label]);
    assert.deepEqual(hiddenRanges, [{ start: 0, end: 318, reason: 'intro' }]);
  });

  test("the AI's own start and end places become the pinned ones, keeping their stops", () => {
    const { candidates } = pinTripEnds(
      {
        candidates: [
          place('Kolkata', 100, { quote: 'starting from Kolkata' }),
          place('kolkata', 400),
          place('Asansol', 900),
          place('Dehri', 1500, { stayUntil: 1700, stopKind: 'overnight' }),
        ],
        hiddenRanges: [{ start: 1750, end: 1800, reason: 'recap' }],
      },
      { start: KOLKATA, end: DEHRI },
      1800,
    );
    assert.deepEqual(names(candidates), [
      ['Kolkata', 100, true, 'start'],
      ['Asansol', 900, true, null],
      ['Dehri', 1500, true, 'end'],
    ]);
    // Still in Kolkata until the last time it was seen; a night in Dehri.
    assert.equal(candidates[0].stayUntil, 400);
    assert.equal(candidates[0].quote, 'starting from Kolkata');
    assert.equal(candidates[0].evidence, 'sign');
    assert.deepEqual([candidates[2].stayUntil, candidates[2].stopKind], [1700, 'overnight']);
  });

  test("the end is never before a ticked place, and without a start time the intro's end is used", () => {
    const { candidates, hiddenRanges } = pinTripEnds(
      {
        candidates: [place('Asansol', 900), place('Aurangabad', 1500)],
        hiddenRanges: [{ start: 0, end: 90, reason: 'intro' }, { start: 1700, end: 1800, reason: 'recap' }],
        startTime: null,
        endTime: 1200,
      },
      { start: KOLKATA, end: DEHRI },
      1800,
    );
    assert.deepEqual(names(candidates), [
      ['Kolkata', 90, true, 'start'],
      ['Asansol', 900, true, null],
      ['Aurangabad', 1500, true, null],
      ['Dehri', 1500, true, 'end'],
    ]);
    assert.deepEqual(hiddenRanges, [{ start: 0, end: 90, reason: 'intro' }, { start: 1700, end: 1800, reason: 'recap' }]);

    // Without an end time, the end is where a closing recap starts.
    const recap = pinTripEnds({ candidates: [place('Asansol', 900)], hiddenRanges: [{ start: 1700, end: 1800, reason: 'recap' }] }, { start: null, end: DEHRI }, 1800);
    assert.deepEqual(names(recap.candidates), [
      ['Asansol', 900, true, null],
      ['Dehri', 1700, true, 'end'],
    ]);
  });

  test('a round trip: the start and the end are both the same town', () => {
    const { candidates } = pinTripEnds(
      { candidates: [place('Delhi', 60), place('Manali', 900), place('Delhi', 1600)], hiddenRanges: [] },
      { start: { ...KOLKATA, name: 'Delhi' }, end: { ...KOLKATA, name: 'Delhi' } },
      1800,
    );
    assert.deepEqual(names(candidates), [
      ['Delhi', 60, true, 'start'],
      ['Manali', 900, true, null],
      ['Delhi', 1600, true, 'end'],
    ]);
  });
});
