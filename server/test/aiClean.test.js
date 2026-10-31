import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cleanClip, mergeClips, mergeHiddenRanges, planClips } from '../src/aiRoute/clean.js';
import { parseClock } from '../src/utils/time.js';

const place = (time, name, extra = {}) => ({ time, name, presence: 'here', evidence: 'sign', confidence: 0.9, ...extra });

test('parseClock', () => {
  assert.equal(parseClock('1:02:05'), 3725);
  assert.equal(parseClock('12:30'), 750);
  assert.equal(parseClock(90), 90);
  assert.equal(parseClock('soon'), null);
  assert.equal(parseClock(-1), null);
});

describe('cleanClip', () => {
  test('keeps good places and drops malformed ones', () => {
    const { places } = cleanClip(
      {
        places: [
          place('1:30', ' Howrah ', { region: 'West Bengal', quote: 'Howrah station', alt_names: ['Haora'] }),
          place('not a time', 'Nowhere'),
          place('2:00', ''),
          { time: '3:00', name: 'Odd values', presence: 'maybe', evidence: 'dream', confidence: 7 },
        ],
        hidden_ranges: [{ start: '0:00', end: '1:20', reason: 'intro' }, { start: '5:00', end: '4:00', reason: 'recap' }],
      },
      { start: 0, end: 1800 },
      1800,
    );
    assert.deepEqual(
      places.map((p) => [p.time, p.name, p.presence, p.evidence, p.confidence]),
      [
        [90, 'Howrah', 'here', 'sign', 0.9],
        [180, 'Odd values', 'mentioned', 'speech', 1],
      ],
    );
    assert.deepEqual(places[0].altNames, ['Haora']);
  });

  test('turns clip times into whole-video times', () => {
    const clip = { start: 3540, end: 7140 };
    // Times inside the clip's length: counted from the clip's start.
    const relative = cleanClip({ places: [place('5:00', 'A')], hidden_ranges: [] }, clip, 7200);
    assert.equal(relative.places[0].time, 3840);
    // Times beyond the clip's length: already whole-video times.
    const absolute = cleanClip({ places: [place('1:10:00', 'B')], hidden_ranges: [] }, clip, 7200);
    assert.equal(absolute.places[0].time, 4200);
  });

  test('keeps whether a stop was a break or a night, and nothing else', () => {
    const { places } = cleanClip(
      { places: [place('1:00', 'Keylong', { stay_kind: 'overnight' }), place('2:00', 'Jispa', { stay_kind: 'nap' }), place('3:00', 'Darcha')], hidden_ranges: [] },
      { start: 0, end: 1800 },
      1800,
    );
    assert.deepEqual(places.map((p) => p.stopKind), ['overnight', null, null]);
  });

  test('a clip sent as its own file always counts from the clip start', () => {
    // 70:00 is longer than the clip, so it would look like a whole-video time without being told.
    const { places } = cleanClip({ places: [place('70:00', 'C')], hidden_ranges: [] }, { start: 3540, end: 7140 }, 9000, { relative: true });
    assert.equal(places[0].time, 3540 + 4200);
  });

  test('clamps times to the video and ignores stops that end before they start', () => {
    const { places } = cleanClip({ places: [place('40:00', 'Late', { stay_until: '1:00' })], hidden_ranges: [] }, { start: 0, end: 1800 }, 1800);
    assert.equal(places[0].time, 1800);
    assert.equal(places[0].stayUntil, null);
  });
});

describe('mergeClips', () => {
  const clip = (places, hiddenRanges = []) => ({ places, hiddenRanges });
  const p = (time, name, extra = {}) => ({ time, name, presence: 'here', evidence: 'sign', confidence: 0.9, stayUntil: null, region: '', altNames: [], quote: '', ...extra });

  test('the same place in two overlapping clips is kept once', () => {
    const { candidates } = mergeClips([clip([p(3570, 'Durgapur', { confidence: 0.6 })]), clip([p(3600, 'durgapur', { confidence: 0.95 })])], { minConfidence: 0.5 });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].confidence, 0.95);
    assert.equal(candidates[0].time, 3570);
  });

  test('repeated mentions in a row become one stop', () => {
    const { candidates } = mergeClips([clip([p(540, 'Durgapur'), p(600, 'Durgapur'), p(660, 'Durgapur'), p(960, 'Asansol')])], { minConfidence: 0.5 });
    assert.deepEqual(candidates.map((c) => [c.name, c.time, c.stayUntil]), [
      ['Durgapur', 540, 660],
      ['Asansol', 960, null],
    ]);
  });

  test('a night in the middle of repeated mentions wins over a break', () => {
    const { candidates } = mergeClips([clip([p(540, 'Sarchu', { stopKind: 'break' }), p(600, 'Sarchu', { stopKind: 'overnight' }), p(660, 'Sarchu')])], { minConfidence: 0.5 });
    assert.equal(candidates[0].stopKind, 'overnight');
  });

  test('only confident places the traveller is at start ticked', () => {
    const { candidates } = mergeClips(
      [clip([p(10, 'Here'), p(20, 'Unsure', { confidence: 0.3 }), p(30, 'Leh', { presence: 'mentioned' })])],
      { minConfidence: 0.5 },
    );
    assert.deepEqual(candidates.map((c) => c.checked), [true, false, false]);
    assert.deepEqual(candidates[1].flags, ['low_confidence']);
  });

  test('hidden ranges are merged', () => {
    assert.deepEqual(
      mergeHiddenRanges([
        { start: 100, end: 200, reason: 'montage' },
        { start: 0, end: 90, reason: 'intro' },
        { start: 150, end: 260, reason: 'montage' },
      ]),
      [
        { start: 0, end: 90, reason: 'intro' },
        { start: 100, end: 260, reason: 'montage' },
      ],
    );
  });
});

test('planClips splits long videos with a minute of overlap', () => {
  assert.deepEqual(planClips(1800, 60), [{ start: 0, end: 1800 }]);
  assert.deepEqual(planClips(9000, 60), [
    { start: 0, end: 3600 },
    { start: 3540, end: 7140 },
    { start: 7080, end: 9000 },
  ]);
});

test('when the trip sets off and arrives: from each clip, then the earliest and the latest', () => {
  const first = cleanClip({ places: [], hidden_ranges: [], start_time: '5:18' }, { start: 0, end: 1200 }, 3000);
  const second = cleanClip({ places: [], hidden_ranges: [], start_time: '1:00', end_time: '8:00' }, { start: 1140, end: 2340 }, 3000);
  const neither = cleanClip({ places: [], hidden_ranges: [], start_time: 'soon' }, { start: 2280, end: 3000 }, 3000);
  assert.deepEqual([first.startTime, first.endTime], [318, null]);
  // Clip times: this clip starts at 19:00.
  assert.deepEqual([second.startTime, second.endTime], [1200, 1620]);
  assert.deepEqual([neither.startTime, neither.endTime], [null, null]);
  const merged = mergeClips([first, second, neither], { minConfidence: 0.5 });
  assert.deepEqual([merged.startTime, merged.endTime], [318, 1620]);
});

test('a minutes and seconds time written with ":00" after it is not read as hours', () => {
  const answer = {
    places: [
      { time: '24:29:00', stay_until: '29:20:00', name: 'Lava', presence: 'here', confidence: 0.9 },
      { time: '0:31:13', name: 'Gangtok', presence: 'here', confidence: 0.9 },
    ],
    hidden_ranges: [{ start: '0:04', end: '2:51:00', reason: 'intro' }],
  };
  const { places, hiddenRanges } = cleanClip(answer, { start: 0, end: 2008 }, 2008);
  assert.deepEqual(places.map((p) => [p.name, p.time, p.stayUntil]), [
    ['Lava', 1469, 1760],
    ['Gangtok', 1873, null],
  ]);
  assert.deepEqual(hiddenRanges, [{ start: 4, end: 171, reason: 'intro' }]);
  // A long video's real hours are kept.
  assert.equal(cleanClip({ places: [{ time: '1:02:05', name: 'Leh', presence: 'here', confidence: 0.9 }], hidden_ranges: [] }, { start: 0, end: 7200 }, 7200).places[0].time, 3725);
});
