// Reads a video's transcript as the owner gives it: copied from YouTube's
// "Show transcript" panel, or a caption file (.srt, .vtt or .sbv, as YouTube
// Studio downloads them). Returns the lines with the moment each is said,
// and turns them into the timed text the AI reads:
// "[5:18] I'm in Kolkata, let's start".
import { formatClock, parseClock } from './time.js';

// "1:02:05", "02:05", "00:02:05,500" or "0:02:05.500" -> seconds.
const TIME = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`;
const ARROW_LINE = new RegExp(String.raw`^\s*(${TIME})\s*-->\s*(${TIME})`);
const SBV_LINE = new RegExp(String.raw`^\s*(${TIME}),(${TIME})\s*$`);
// The panel puts each time at the start of a line, on its own ("5:18") or
// before the words. Copied from YouTube, the time is followed by how it's
// read out, stuck to the words: "1:061 minute, 6 secondsतो ये है गुवाहाटी।".
const PANEL_TIME = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(.*)$/;
// How the panel reads a time out, in English, Hindi or Bengali.
const UNITS = String.raw`(?:hours?|minutes?|seconds?|घंटे|घंटा|मिनट|सेकंड|ঘণ্টা|মিনিট|সেকেন্ড)`;

// The words after a time, without the time read out ("1 minute, 6 seconds").
function wordsAfter(rest, hours, minutes, seconds) {
  const numbers = [hours, minutes, seconds].filter((n) => n > 0);
  const spoken = (numbers.length ? numbers : [0]).map((n) => String.raw`${n}\s*${UNITS}`).join(String.raw`,?\s*`);
  return rest.replace(new RegExp(String.raw`^\s*${spoken}`, 'u'), '').trim();
}

const toSeconds = (time) => parseClock(time.replace(',', '.'));

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

// The words only: no styling tags, no inline word timings, no [Music].
function clean(line) {
  return line
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{\\[^}]*\}/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
    .replace(/\[[^\]]*\]|♪+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Caption files: a time line ("00:01:02,000 --> 00:01:04,500", or
// "0:01:02.000,0:01:04.500" in .sbv), then the words, then a blank line.
function readCaptionFile(lines, timing) {
  const cues = [];
  let cue = null;
  for (const line of lines) {
    const times = line.match(timing);
    if (times) {
      cue = { start: toSeconds(times[1]), end: toSeconds(times[2]), lines: [] };
      cues.push(cue);
    } else if (!line.trim()) {
      cue = null;
    } else if (cue) {
      cue.lines.push(line);
    }
  }
  return cues;
}

// The transcript panel: a time, then the words until the next time. Lines
// before the first time are left out; chapter names join the words around them.
function readPanel(lines) {
  const cues = [];
  let cue = null;
  for (const line of lines) {
    const time = line.match(PANEL_TIME);
    if (time) {
      const [hours, minutes, seconds] = [time[1] ?? 0, time[2], time[3]].map(Number);
      const words = wordsAfter(time[4], hours, minutes, seconds);
      cue = { start: hours * 3600 + minutes * 60 + seconds, end: null, lines: words ? [words] : [] };
      cues.push(cue);
    } else if (cue && line.trim()) {
      cue.lines.push(line);
    }
  }
  return cues;
}

// -> [{ start, end, text }] in time order, or [] when the text has no times.
export function parseTranscript(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/);
  const cues = lines.some((line) => ARROW_LINE.test(line))
    ? readCaptionFile(lines, ARROW_LINE)
    : lines.some((line) => SBV_LINE.test(line))
      ? readCaptionFile(lines, SBV_LINE)
      : readPanel(lines);

  // YouTube's automatic captions repeat the line before as each new one rolls
  // in: keep each line once, at the moment it first appears.
  const said = [];
  const recent = [];
  for (const cue of cues.filter((c) => Number.isFinite(c.start)).sort((a, b) => a.start - b.start)) {
    const fresh = cue.lines.map(clean).filter((line) => line && !recent.includes(line));
    if (fresh.length === 0) continue;
    recent.push(...fresh);
    recent.splice(0, recent.length - 3);
    said.push({ start: cue.start, end: cue.end ?? cue.start, text: fresh.join(' ') });
  }
  return said;
}

// The lines as the AI reads them, a few seconds of speech to a line:
// "[5:18] I'm in Kolkata, let's start".
export function timedTranscript(cues, { lineSeconds = 15, lineChars = 300 } = {}) {
  const out = [];
  let line = null;
  for (const cue of cues) {
    if (!line || cue.start - line.start >= lineSeconds || line.text.length + cue.text.length > lineChars) {
      line = { start: cue.start, text: cue.text };
      out.push(line);
    } else {
      line.text += ` ${cue.text}`;
    }
  }
  return out.map((l) => `[${formatClock(l.start)}] ${l.text}`).join('\n');
}
