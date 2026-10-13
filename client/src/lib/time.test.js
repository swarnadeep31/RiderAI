import { describe, expect, test } from 'vitest';
import { formatDuration, formatTime, parseTime } from './time.js';

describe('formatTime', () => {
  test.each([
    [0, '0:00'],
    [5.9, '0:05'],
    [75, '1:15'],
    [3725, '1:02:05'],
    [-3, '0:00'],
  ])('%s -> %s', (seconds, text) => expect(formatTime(seconds)).toBe(text));
});

describe('parseTime', () => {
  test.each([
    ['90', 90],
    ['1:15', 75],
    [' 1:02:05 ', 3725],
    ['0:00', 0],
  ])('%s -> %s', (text, seconds) => expect(parseTime(text)).toBe(seconds));

  test.each(['', 'abc', '1:xx', '1:2:3:4', '-5', '1.5'])('rejects %j', (text) => expect(parseTime(text)).toBeNull());
});

test('formatDuration', () => {
  expect(formatDuration(30)).toBe('30 s');
  expect(formatDuration(45 * 60)).toBe('45 min');
  expect(formatDuration(2 * 3600)).toBe('2 h');
  expect(formatDuration(2 * 3600 + 15 * 60)).toBe('2 h 15 min');
});
