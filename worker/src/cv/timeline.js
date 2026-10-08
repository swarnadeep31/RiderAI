// Turns noisy per-frame gear readings into stable segments and gear-change events.

const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

// Each label becomes the value most of its neighbours agree on. A single
// misread frame disappears, and a gear has to be visible for over half the
// window (3 of 5 samples by default) before it counts.
function majorityFilter(labels, window) {
  const half = Math.floor(window / 2);
  return labels.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(labels.length - 1, i + half);
    const counts = new Map();
    for (let j = from; j <= to; j++) {
      if (labels[j] !== null) counts.set(labels[j], (counts.get(labels[j]) ?? 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [label, count] of counts) {
      if (count > bestCount) {
        best = label;
        bestCount = count;
      }
    }
    return bestCount * 2 > to - from + 1 ? best : null;
  });
}

function toRuns(labels) {
  const runs = [];
  labels.forEach((gear, i) => {
    const last = runs.at(-1);
    if (last && last.gear === gear) last.last = i;
    else runs.push({ gear, first: i, last: i });
  });
  return runs;
}

// A short unreadable stretch between two readings of the same gear (a hand
// on the display, a flash of glare) is treated as that gear.
function bridgeGaps(runs, maxGapSamples) {
  const out = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const prev = out.at(-1);
    const next = runs[i + 1];
    const gapSamples = run.last - run.first + 1;
    if (run.gear === null && prev && next && prev.gear === next.gear && gapSamples <= maxGapSamples) {
      prev.last = next.last;
      i += 1;
      continue;
    }
    out.push({ ...run });
  }
  return out;
}

// Motorcycle gearboxes are sequential: 1-N-2-3-4-5-6. A jump such as 3 -> 5
// means a gear was missed or misread. Returns null for labels it can't place.
function gearPosition(gear) {
  if (gear === 'N') return 1.5;
  return /^\d+$/.test(gear) ? Number(gear) : null;
}

function isSequentialShift(from, to) {
  const a = gearPosition(from);
  const b = gearPosition(to);
  if (a === null || b === null) return null;
  return Math.abs(a - b) <= 1;
}

export function buildTimeline(readings, { fps, window = 5, maxGapSeconds = 1 }) {
  const labels = majorityFilter(readings.map((r) => r.gear), window);
  const runs = bridgeGaps(toRuns(labels), Math.round(maxGapSeconds * fps));

  const segments = runs.map((run) => {
    let confidence = null;
    if (run.gear !== null) {
      const scores = readings.slice(run.first, run.last + 1).filter((r) => r.gear === run.gear).map((r) => r.score);
      confidence = round(scores.reduce((sum, s) => sum + s, 0) / scores.length, 3);
    }
    return {
      gear: run.gear,
      start: round(readings[run.first].time),
      end: round(readings[run.last].time + 1 / fps),
      confidence,
    };
  });

  const events = [];
  let previous = null;
  for (const segment of segments) {
    if (segment.gear === null) continue;
    if (previous && segment.gear !== previous.gear) {
      // If the display was unreadable in between, the shift happened
      // somewhere in that gap; report its middle and how long it was.
      events.push({
        timestamp: round((previous.end + segment.start) / 2),
        previousGear: previous.gear,
        gear: segment.gear,
        confidence: Math.min(previous.confidence, segment.confidence),
        gapSeconds: round(segment.start - previous.end),
        sequential: isSequentialShift(previous.gear, segment.gear),
      });
    }
    previous = segment;
  }

  const timeInGear = {};
  let unknownSeconds = 0;
  for (const segment of segments) {
    const seconds = segment.end - segment.start;
    if (segment.gear === null) unknownSeconds += seconds;
    else timeInGear[segment.gear] = round((timeInGear[segment.gear] ?? 0) + seconds);
  }

  return {
    segments,
    events,
    summary: {
      gearChanges: events.length,
      nonSequentialChanges: events.filter((e) => e.sequential === false).length,
      timeInGear,
      unknownSeconds: round(unknownSeconds),
    },
  };
}
