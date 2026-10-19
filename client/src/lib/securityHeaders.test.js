// The website's security headers live in vercel.json. These checks keep them
// in step with the code: the inline script in index.html is allowed by its
// hash, and every outside site the pages load from is allowed.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const vercel = JSON.parse(read('../../vercel.json'));
const pageHeaders = Object.fromEntries(vercel.headers.find((rule) => rule.source === '/((?!api/).*)').headers.map((h) => [h.key, h.value]));
const csp = Object.fromEntries(
  pageHeaders['Content-Security-Policy'].split(';').map((part) => {
    const [name, ...sources] = part.trim().split(/\s+/);
    return [name, sources];
  }),
);

describe('the website security headers', () => {
  test("the inline script in index.html is allowed by its hash (update vercel.json when it changes)", () => {
    const scripts = [...read('../../index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toHaveLength(1);
    const hash = `'sha256-${createHash('sha256').update(scripts[0]).digest('base64')}'`;
    expect(csp['script-src']).toContain(hash);
  });

  test('the outside sites the pages use are allowed, and nothing may frame the site', () => {
    expect(read('../hooks/useYouTubePlayer.js')).toContain('https://www.youtube.com/iframe_api');
    expect(csp['script-src']).toEqual(expect.arrayContaining(['https://www.youtube.com', 'https://accounts.google.com/gsi/client']));
    expect(csp['frame-src']).toEqual(expect.arrayContaining(['https://www.youtube.com', 'https://accounts.google.com/gsi/']));
    expect(read('../components/TrailMap.jsx')).toContain('https://tile.openstreetmap.org/');
    expect(csp['img-src']).toEqual(expect.arrayContaining(['https://i.ytimg.com', 'https://tile.openstreetmap.org']));
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(pageHeaders['X-Frame-Options']).toBe('DENY');
  });
});
