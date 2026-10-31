import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseTranscript, timedTranscript } from '../src/utils/transcript.js';

const said = (cues) => cues.map((c) => [c.start, c.text]);

describe('parseTranscript', () => {
  test("copied from YouTube's transcript panel: times on their own line or before the words", () => {
    const panel = ['Intro', '0:00', 'hello everyone welcome back', '0:04', 'today we ride from Kolkata', '5:18 so we are in Kolkata, let us start', '1:02:05', 'we have reached Dehri'].join('\n');
    assert.deepEqual(said(parseTranscript(panel)), [
      [0, 'hello everyone welcome back'],
      [4, 'today we ride from Kolkata'],
      [318, 'so we are in Kolkata, let us start'],
      [3725, 'we have reached Dehri'],
    ]);
  });

  test('as YouTube copies the panel: each time read out and stuck to the words, in English or Hindi', () => {
    const copied = [
      '0:044 secondsपता है हम इंसानों की क्या आदत है?',
      '1:061 minute, 6 secondsतो ये है गुवाहाटी।',
      '2:072 मिनट, 7 सेकंडवेल हेलो गाइस',
      '3:003 minutesरांगपो करके वहीं के 11 घंटे दिखा रहा है',
      '6:386 minutes, 38 seconds[संगीत]',
      '28:0128 minutes, 1 secondबाद सिक्किम आए हैं',
      '1:02:051 hour, 2 minutes, 5 secondsलो जी आ गए',
    ].join('\n');
    assert.deepEqual(said(parseTranscript(copied)), [
      [4, 'पता है हम इंसानों की क्या आदत है?'],
      [66, 'तो ये है गुवाहाटी।'],
      [127, 'वेल हेलो गाइस'],
      [180, 'रांगपो करके वहीं के 11 घंटे दिखा रहा है'],
      [1681, 'बाद सिक्किम आए हैं'],
      [3725, 'लो जी आ गए'],
    ]);
  });

  test('a .srt file, with numbers, styling and sounds left out', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:04,000\r\nWe are in <i>Durgapur</i> [Music]\r\n\r\n2\r\n00:00:20,500 --> 00:00:22,000\r\nAsansol &amp; then Dhanbad\r\n';
    assert.deepEqual(parseTranscript(srt), [
      { start: 1, end: 4, text: 'We are in Durgapur' },
      { start: 20.5, end: 22, text: 'Asansol & then Dhanbad' },
    ]);
  });

  test("a .vtt file of YouTube's automatic captions: each line once, when it first appears", () => {
    const vtt = [
      'WEBVTT',
      'Kind: captions',
      'Language: en',
      '',
      '00:00:00.000 --> 00:00:02.000 align:start position:0%',
      'hello<00:00:00.500><c> everyone</c>',
      '',
      '00:00:02.000 --> 00:00:04.000 align:start position:0%',
      'hello everyone',
      'we are leaving Kolkata',
      '',
      '00:00:04.000 --> 00:00:06.000 align:start position:0%',
      'we are leaving Kolkata',
      'next stop Durgapur',
    ].join('\n');
    assert.deepEqual(said(parseTranscript(vtt)), [
      [0, 'hello everyone'],
      [2, 'we are leaving Kolkata'],
      [4, 'next stop Durgapur'],
    ]);
  });

  test('a .sbv file', () => {
    assert.deepEqual(said(parseTranscript('0:00:01.000,0:00:04.000\nfirst line\n\n0:01:05.000,0:01:06.000\nsecond line\n')), [
      [1, 'first line'],
      [65, 'second line'],
    ]);
  });

  test('nothing without times', () => {
    assert.deepEqual(parseTranscript('we rode from Kolkata to Dehri'), []);
    assert.deepEqual(parseTranscript(''), []);
  });
});

test('timedTranscript puts a few seconds of speech on each line, starting with its time', () => {
  const cues = [
    { start: 0, text: 'hello everyone' },
    { start: 4, text: 'today we ride' },
    { start: 318, text: "I'm in Kolkata, let's start" },
    { start: 3725, text: 'we have reached Dehri' },
  ];
  assert.equal(timedTranscript(cues), "[0:00] hello everyone today we ride\n[5:18] I'm in Kolkata, let's start\n[1:02:05] we have reached Dehri");
});
