// Checks and tidies Gemini's answers: drops anything malformed, turns times
// into whole-video seconds, merges the overlapping clips, and turns repeated
// mentions of the same place into one stop.
import { parseClock } from '../utils/time.js';

const PRESENCES = ['here', 'mentioned'];
const EVIDENCE = ['sign', 'milestone', 'speech', 'landmark'];
const HIDDEN_REASONS = ['intro', 'recap', 'montage', 'flashback', 'off_route'];
const STAY_KINDS = ['break', 'overnight'];
const SAME_PLACE_WINDOW = 120; // seconds: the same name this close in two clips is one place
export const MAX_CANDIDATES = 150;

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
export const sameName = (a, b) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

// Gemini may count times from the start of the clip or of the whole video.
// If every time fits inside the clip's length, treat them as clip times.
function clipOffset(times, clip) {
  if (clip.start === 0 || times.length === 0) return 0;
  return times.every((t) => t <= clip.end - clip.start + 5) ? clip.start : 0;
}

// One clip's answer -> { places, hiddenRanges, startTime, endTime } in
// whole-video seconds (startTime/endTime: when the trip sets off and arrives,
// or null when this clip doesn't show it).
// relative: the clip was sent as its own file, so its times surely count from the clip's start.
export function cleanClip(answer, clip, duration, { relative = false } = {}) {
  const rawPlaces = Array.isArray(answer?.places) ? answer.places : [];
  const rawHidden = Array.isArray(answer?.hidden_ranges) ? answer.hidden_ranges : [];
  const allTimes = [
    parseClock(answer?.start_time),
    parseClock(answer?.end_time),
    ...rawPlaces.map((p) => parseClock(p?.time)),
    ...rawHidden.flatMap((r) => [parseClock(r?.start), parseClock(r?.end)]),
  ].filter((t) => t !== null);
  const offset = relative ? clip.start : clipOffset(allTimes, clip);
  const toVideoTime = (value) => {
    const t = parseClock(value);
    return t === null ? null : Math.min(Math.max(t + offset, 0), duration);
  };

  const places = [];
  for (const p of rawPlaces) {
    const time = toVideoTime(p?.time);
    const name = text(p?.name, 100);
    if (time === null || !name) continue;
    const stayUntil = toVideoTime(p?.stay_until);
    const confidence = Number(p?.confidence);
    places.push({
      time,
      stayUntil: stayUntil !== null && stayUntil > time ? stayUntil : null,
      // A night's stay counts towards the trip's riding days.
      stopKind: STAY_KINDS.includes(p?.stay_kind) ? p.stay_kind : null,
      name,
      region: text(p?.region, 100),
      altNames: (Array.isArray(p?.alt_names) ? p.alt_names : []).map((n) => text(n, 100)).filter(Boolean).slice(0, 5),
      presence: PRESENCES.includes(p?.presence) ? p.presence : 'mentioned',
      evidence: EVIDENCE.includes(p?.evidence) ? p.evidence : 'speech',
      quote: text(p?.quote, 200),
      confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.3,
    });
  }

  const hiddenRanges = [];
  for (const r of rawHidden) {
    const start = toVideoTime(r?.start);
    const end = toVideoTime(r?.end);
    if (start === null || end === null || end <= start) continue;
    hiddenRanges.push({ start, end, reason: HIDDEN_REASONS.includes(r?.reason) ? r.reason : 'off_route' });
  }
  return { places, hiddenRanges, startTime: toVideoTime(answer?.start_time), endTime: toVideoTime(answer?.end_time) };
}

export function mergeHiddenRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

// All clips -> the candidate list the reviewer sees, the parts to skip, and
// when the trip sets off (the earliest any clip saw) and arrives (the latest).
export function mergeClips(cleanedClips, { minConfidence }) {
  const all = cleanedClips
    .flatMap((c, clip) => c.places.map((place) => ({ ...place, clip })))
    .sort((a, b) => a.time - b.time);

  // The same place found by two overlapping clips: keep the more confident one.
  // (Repeats within one clip are a stop, handled next.)
  const unique = [];
  for (const place of all) {
    const twin = unique.find(
      (u) => u.clip !== place.clip && sameName(u.name, place.name) && Math.abs(u.time - place.time) <= SAME_PLACE_WINDOW,
    );
    if (!twin) unique.push(place);
    else if (place.confidence > twin.confidence) Object.assign(twin, place, { time: Math.min(twin.time, place.time) });
  }

  // The same place mentioned again and again in a row: one place, staying until the last mention.
  const collapsed = [];
  for (const place of unique) {
    const last = collapsed.at(-1);
    if (last && sameName(last.name, place.name) && last.presence === 'here' && place.presence === 'here') {
      last.stayUntil = Math.max(last.stayUntil ?? last.time, place.stayUntil ?? place.time);
      last.confidence = Math.max(last.confidence, place.confidence);
      // A night's stay wins over a break.
      if (place.stopKind === 'overnight') last.stopKind = 'overnight';
      else last.stopKind ??= place.stopKind;
      continue;
    }
    collapsed.push({ ...place });
  }

  const candidates = collapsed.slice(0, MAX_CANDIDATES).map(({ clip, ...place }, i) => ({
    id: String(i + 1),
    ...place,
    lat: null,
    lng: null,
    label: '',
    alternatives: [],
    flags: place.confidence < minConfidence ? ['low_confidence'] : [],
    // Ticked in review only when the AI is fairly sure the traveller is there.
    checked: place.presence === 'here' && place.confidence >= minConfidence,
  }));

  const starts = cleanedClips.map((c) => c.startTime).filter((t) => Number.isFinite(t));
  const ends = cleanedClips.map((c) => c.endTime).filter((t) => Number.isFinite(t));
  return {
    candidates,
    hiddenRanges: mergeHiddenRanges(cleanedClips.flatMap((c) => c.hiddenRanges)),
    startTime: starts.length ? Math.min(...starts) : null,
    endTime: ends.length ? Math.max(...ends) : null,
  };
}

// Splits a long video into clips with a little overlap, so a place at a boundary isn't lost.
export function planClips(durationSec, clipMinutes, overlapSec = 60) {
  const clipLength = clipMinutes * 60;
  if (durationSec <= clipLength) return [{ start: 0, end: durationSec }];
  const clips = [];
  for (let start = 0; start < durationSec; start += clipLength - overlapSec) {
    clips.push({ start, end: Math.min(start + clipLength, durationSec) });
    if (start + clipLength >= durationSec) break;
  }
  return clips;
}
