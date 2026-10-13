// Pulls the 11-character video ID out of anything people paste: watch links,
// short links, live and shorts links, embed links, or the bare ID.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);

export function parseYouTubeId(input) {
  const text = String(input ?? '').trim();
  if (VIDEO_ID.test(text)) return text;

  let url;
  try {
    url = new URL(text.includes('://') ? text : `https://${text}`);
  } catch {
    return null;
  }

  let id = null;
  if (url.hostname === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    const [first, second] = url.pathname.split('/').filter(Boolean);
    if (first === 'watch') id = url.searchParams.get('v');
    else if (['live', 'shorts', 'embed', 'v'].includes(first)) id = second;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}
