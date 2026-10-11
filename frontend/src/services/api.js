const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// The access token lives in memory only (never localStorage). AuthContext keeps it current.
let accessToken = null;
export const setAccessToken = (token) => { accessToken = token; };

async function send(path, options) {
  const headers = { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(options.headers || {}) };
  return fetch(`${API}${path}`, { credentials: 'include', ...options, headers });
}

export async function request(path, options = {}) {
  let response = await send(path, options);
  // Access tokens last 15 minutes; renew once via the refresh cookie so long sessions (e.g. a timed test) survive.
  if (response.status === 401 && accessToken && !path.startsWith('/auth/')) {
    const renewed = await send('/auth/refresh', { method: 'POST' });
    if (renewed.ok) {
      accessToken = (await renewed.json()).accessToken;
      response = await send(path, options);
    }
  }
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.message || 'Request failed'); error.errors = body.errors; error.code = body.code; error.status = response.status; throw error; }
  return body;
}
