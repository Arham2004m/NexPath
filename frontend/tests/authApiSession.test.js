import { afterEach, describe, expect, it, vi } from 'vitest';
import { request, setAccessToken } from '../src/services/api';
import { changePassword } from '../src/services/authApi';

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

describe('changing the password keeps this device signed in', () => {
  it('adopts the fresh access token the server sends, so the next request is not rejected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: 'done', accessToken: 'fresh-token' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('old-token');
    await changePassword({ currentPassword: 'a', newPassword: 'b', confirmPassword: 'b' });
    await request('/anything');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer old-token');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
  });
});
