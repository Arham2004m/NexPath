import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDate, onSessionExpired, request, setAccessToken } from '../src/services/api';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => { setAccessToken(null); onSessionExpired(null); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('localDate', () => {
  it('uses the local calendar day, zero padded', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 10, 2, 0, 1))).toBe('2026-11-02');
  });
});

describe('request', () => {
  it('sends the token and the local date and returns the body', async () => {
    const fetchMock = vi.fn(async () => reply(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('abc');
    expect(await request('/thing')).toEqual({ ok: true });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer abc');
    expect(options.headers['X-Client-Date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(options.credentials).toBe('include');
  });

  it('turns an error answer into an Error with its message, field errors and code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(400, { message: 'Nope', errors: { email: 'bad' }, code: 'X' })));
    await expect(request('/x')).rejects.toMatchObject({ message: 'Nope', errors: { email: 'bad' }, code: 'X', status: 400 });
  });

  it('copes with an empty or non-JSON error page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } })));
    await expect(request('/x')).rejects.toMatchObject({ message: 'Request failed', status: 502 });
  });

  it('says so plainly when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(request('/x')).rejects.toMatchObject({ code: 'NETWORK', message: expect.stringMatching(/could not reach the server/i) });
  });

  it('renews an expired token once and retries', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push(`${options.method || 'GET'} ${url.split('/api')[1]} ${options.headers.Authorization || ''}`);
      if (url.endsWith('/auth/refresh')) return reply(200, { accessToken: 'fresh' });
      return options.headers.Authorization === 'Bearer fresh' ? reply(200, { done: true }) : reply(401, { message: 'expired' });
    }));
    setAccessToken('old');
    expect(await request('/data')).toEqual({ done: true });
    expect(calls).toEqual(['GET /data Bearer old', 'POST /auth/refresh Bearer old', 'GET /data Bearer fresh']);
  });

  it('several requests that hit an expired token share one renewal', async () => {
    let refreshes = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.endsWith('/auth/refresh')) { refreshes += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return reply(200, { accessToken: 'fresh' }); }
      return options.headers.Authorization === 'Bearer fresh' ? reply(200, { ok: 1 }) : reply(401, {});
    }));
    setAccessToken('old');
    await Promise.all([request('/a'), request('/b'), request('/c')]);
    expect(refreshes).toBe(1);
  });

  it('signs the student out when the session cannot be renewed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (url.endsWith('/auth/refresh') ? reply(401, {}) : reply(401, { message: 'expired' }))));
    const expired = vi.fn();
    onSessionExpired(expired);
    setAccessToken('old');
    await expect(request('/data')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not treat a wrong password as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(401, { message: 'Invalid credentials' })));
    const expired = vi.fn();
    onSessionExpired(expired);
    await expect(request('/auth/login', { method: 'POST', body: '{}' })).rejects.toMatchObject({ message: 'Invalid credentials' });
    expect(expired).not.toHaveBeenCalled();
  });
});
