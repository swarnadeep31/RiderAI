import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseYouTubeId } from '../src/utils/youtube.js';

const ID = 'aBcD3fGh1_-';

test('finds the video ID in every common kind of YouTube link', () => {
  for (const link of [
    ID,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc&t=10`,
    `https://www.youtube.com/live/${ID}?feature=shared`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `  https://youtu.be/${ID}  `,
  ]) {
    assert.equal(parseYouTubeId(link), ID, link);
  }
});

test('rejects links that are not YouTube videos', () => {
  for (const link of [
    '',
    undefined,
    'hello',
    'https://vimeo.com/123456789',
    `https://example.com/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=tooShort',
    'https://www.youtube.com/@somechannel',
    'https://www.youtube.com/playlist?list=PL123',
  ]) {
    assert.equal(parseYouTubeId(link), null, String(link));
  }
});
