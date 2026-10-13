// Every call to the Express API goes through here. The browser sends the
// login cookie along automatically, because the API is on the same site.

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the TrailCast server. Is it running?");
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (!data && res.status >= 500) throw new Error("Can't reach the TrailCast server. Is it running?");
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // Accounts
  me: () => request('/auth/me'),
  signup: (details) => request('/auth/signup', { method: 'POST', body: details }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  saveOnboarding: (answers) => request('/auth/onboarding', { method: 'PUT', body: answers }),
  sendFeedback: (message) => request('/feedback', { method: 'POST', body: { message } }),

  // What the server can do (e.g. whether it can follow roads)
  getConfig: () => request('/config'),
  searchPlaces: (query) => request(`/places?q=${encodeURIComponent(query)}`),

  // Trails
  listTrails: () => request('/trails'),
  getTrail: (id) => request(`/trails/${id}`),
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
      xhr.onerror = () => reject(new Error("Can't reach the TrailCast server. Is it running?"));
      xhr.send(file);
    }),
  getJob: (jobId) => request(`/jobs/${jobId}`),
  cancelJob: (jobId) => request(`/jobs/${jobId}/cancel`, { method: 'POST' }),
};
