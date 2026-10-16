// Checks a video is public and can be embedded, and finds out whose channel
// it's on, using YouTube's free oEmbed endpoint (no key needed). Gemini can
// only watch public videos.

const oembedUrl = () => process.env.YOUTUBE_OEMBED_URL || 'https://www.youtube.com/oembed';
const isWebLink = (value) => /^https?:\/\//.test(value ?? '');

// The YouTube channel the video is on: { name, url }, or null if YouTube
// doesn't say (a private video, or YouTube can't be reached).
export async function fetchChannel(youtubeId, { timeoutMs = 5000 } = {}) {
  const url = `${oembedUrl()}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const info = await res.json();
    const name = typeof info.author_name === 'string' ? info.author_name.trim().slice(0, 100) : '';
    return name ? { name, url: isWebLink(info.author_url) ? info.author_url : undefined } : null;
  } catch {
    return null;
  }
}

export async function checkVideo(youtubeId) {
  const url = `${oembedUrl()}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    return { ok: false, retryable: true, reason: "Couldn't reach YouTube to check the video." };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "The video's owner doesn't allow it to be played on other websites." };
  }
  if (!res.ok) return { ok: false, reason: 'This video is private, unlisted or was removed. The AI can only watch public videos.' };
  const info = await res.json().catch(() => ({}));
  return { ok: true, title: info.title ?? '', author: info.author_name ?? '' };
}
