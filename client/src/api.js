// Every call to the Express API goes through here. The browser sends the
// login cookie along automatically, because the API is on the same site.
// A failed call throws an error with the server's words and its `status`
// (0 when the server couldn't be reached at all), so a page can show the
// right error page (see pages/ErrorPage.jsx).

// When the server answers with an error page instead of its own words (the
// hosting's, while the server is asleep, restarting or down).
const NO_ANSWER = {
  502: "TrailCast's server sent back a broken answer. Try again in a minute.",
  503: "TrailCast's server is busy or being updated. Try again in a few minutes.",
  504: "TrailCast's server took too long to answer. It may be waking up: try again in a minute.",
};

// The server couldn't be reached: no connection, or the network dropped.
export function unreachable() {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return Object.assign(new Error(offline ? "You're offline. Check your connection and try again." : "Couldn't reach TrailCast. Check your connection and try again."), {
    status: 0,
  });
}

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw unreachable();
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (!data && res.status >= 500) {
      throw Object.assign(new Error(NO_ANSWER[res.status] ?? "TrailCast's server had a problem. Try again in a minute."), { status: res.status });
    }
    // code: something the page can act on, like 'exists' (an account is already there).
    throw Object.assign(new Error(data?.error ?? `Request failed (${res.status})`), { code: data?.code, status: res.status });
  }
  return data;
}

export const api = {
  // Accounts
  me: () => request('/auth/me'),
  // details: { name, password, and email or phone }
  signup: (details) => request('/auth/signup', { method: 'POST', body: details }),
  // credentials: { password, and email or phone }
  login: (credentials) => request('/auth/login', { method: 'POST', body: credentials }),
  // credential: the token from Google's sign-in button. Answers { user, existing }.
  loginWithGoogle: (credential) => request('/auth/google', { method: 'POST', body: { credential } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  logoutEverywhere: () => request('/auth/logout-everywhere', { method: 'POST' }),
  saveOnboarding: (answers) => request('/auth/onboarding', { method: 'PUT', body: answers }),
  sendFeedback: (message) => request('/feedback', { method: 'POST', body: { message } }),

  // What the server can do (e.g. whether it can follow roads)
  getConfig: () => request('/config'),
  searchPlaces: (query) => request(`/places?q=${encodeURIComponent(query)}`),

  // Trails
  // The newest trails, a page at a time: `before` is the last trail already shown.
  listTrails: (before) => request(before ? `/trails?before=${encodeURIComponent(before)}` : '/trails'),
  getTrail: (id) => request(`/trails/${id}`),
  // A YouTube video's title and channel (the title usually says where the trip goes).
  videoInfo: (url) => request(`/trails/video-info?url=${encodeURIComponent(url)}`),
  createTrail: (trail) => request('/trails', { method: 'POST', body: trail }),
  updateTrail: (id, changes) => request(`/trails/${id}`, { method: 'PATCH', body: changes }),
  deleteTrail: (id) => request(`/trails/${id}`, { method: 'DELETE' }),
  addPoint: (id, point) => request(`/trails/${id}/points`, { method: 'POST', body: point }),
  updatePoint: (id, pointId, changes) => request(`/trails/${id}/points/${pointId}`, { method: 'PATCH', body: changes }),
  deletePoint: (id, pointId) => request(`/trails/${id}/points/${pointId}`, { method: 'DELETE' }),
  // style: 'roads', 'paths' or 'straight'
  drawRoute: (id, style) => request(`/trails/${id}/route`, { method: 'POST', body: { style } }),
  // Fuel stops, mechanics, medical help and ATMs along the route
  getServices: (id) => request(`/trails/${id}/services`),
  // Work out the heights, services and stats again (owner only)
  enrich: (id) => request(`/trails/${id}/enrich`, { method: 'POST' }),

  // Building the route with AI
  startAiRoute: (id, options) => request(`/trails/${id}/ai-route`, { method: 'POST', body: options }),
  latestAiRoute: (id) => request(`/trails/${id}/ai-route`),
  acceptAiRoute: (id, body) => request(`/trails/${id}/ai-route/accept`, { method: 'POST', body }),
  // The video's transcript instead of the video: { text, durationSec }.
  startAiFromTranscript: (id, body) => request(`/trails/${id}/ai-route/transcript`, { method: 'POST', body }),
  // A video file from the owner's computer instead of the YouTube link. options:
  // { mode: 'full' | 'picture' | 'sound', durationSec, highDetail }. onProgress gets 0 to 1.
  uploadAiVideo: (id, file, { mode, durationSec, highDetail }, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const query = new URLSearchParams({ mode, durationSec: String(durationSec), highDetail: String(highDetail) });
      xhr.open('POST', `/api/trails/${id}/ai-route/upload?${query}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // Not JSON: explained below.
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data?.error ?? `The upload failed (${xhr.status}).`));
      };
      xhr.onerror = () => reject(unreachable());
      xhr.send(file);
    }),
  getJob: (jobId) => request(`/jobs/${jobId}`),
  cancelJob: (jobId) => request(`/jobs/${jobId}/cancel`, { method: 'POST' }),
};
