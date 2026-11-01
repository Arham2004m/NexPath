const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// The access token lives in memory only (never localStorage). AuthContext keeps it current.
let accessToken = null;
export const setAccessToken = (token) => { accessToken = token; };

// Called when a signed-in session can no longer be renewed (e.g. the refresh cookie expired), so the app can send the
// student back to sign in instead of showing errors on every page.
let sessionExpiredHandler = null;
export const onSessionExpired = (handler) => { sessionExpiredHandler = handler; };

// The student's own calendar day, so "this week" and "overdue" follow their clock (the server would otherwise use UTC).
export function localDate(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function send(path, options) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Date': localDate(),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers || {})
  };
  try {
    return await fetch(`${API}${path}`, { credentials: 'include', ...options, headers });
  } catch {
    const error = new Error('Could not reach the server. Check your connection and try again.');
    error.code = 'NETWORK';
    throw error;
  }
}

// Several requests can hit an expired token at once; they all wait for one renewal instead of each starting their own.
let renewal = null;
function renewToken() {
  renewal ||= send('/auth/refresh', { method: 'POST' })
    .then(async (response) => (response.ok ? (await response.json()).accessToken : null))
    .catch(() => null)
    .finally(() => { renewal = null; });
  return renewal;
}

export async function request(path, options = {}) {
  let response = await send(path, options);
  // Access tokens last 15 minutes; renew once via the refresh cookie so long sessions (e.g. a timed test) survive.
  if (response.status === 401 && accessToken && !path.startsWith('/auth/')) {
    const renewed = await renewToken();
    if (renewed) {
      accessToken = renewed;
      response = await send(path, options);
    } else {
      accessToken = null;
      sessionExpiredHandler?.();
    }
  }
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.message || 'Request failed');
    error.errors = body?.errors;
    error.code = body?.code;
    error.status = response.status;
    throw error;
  }
  return body;
}
