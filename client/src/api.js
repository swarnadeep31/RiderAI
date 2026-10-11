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
  deletePoint: (id, pointId) => request(`/trails/${id}/points/${pointId}`, { method: 'DELETE' }),
  // style: 'roads', 'paths' or 'straight'
  drawRoute: (id, style) => request(`/trails/${id}/route`, { method: 'POST', body: { style } }),

  // Building the route with AI
  startAiRoute: (id, options) => request(`/trails/${id}/ai-route`, { method: 'POST', body: options }),
  latestAiRoute: (id) => request(`/trails/${id}/ai-route`),
  acceptAiRoute: (id, body) => request(`/trails/${id}/ai-route/accept`, { method: 'POST', body }),
  getJob: (jobId) => request(`/jobs/${jobId}`),
  cancelJob: (jobId) => request(`/jobs/${jobId}/cancel`, { method: 'POST' }),
};
