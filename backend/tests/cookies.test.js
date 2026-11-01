import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { delete process.env.COOKIE_SAMESITE; vi.resetModules(); });
const options = async () => (await import('../src/utils/generateTokens.js')).refreshCookieOptions;

describe('refresh cookie options', () => {
  it('is lax and httpOnly by default', async () => {
    const cookie = await options();
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/auth' });
  });
  it('can be set to none for a website and API on different domains, which forces Secure', async () => {
    process.env.COOKIE_SAMESITE = 'None';
    expect(await options()).toMatchObject({ sameSite: 'none', secure: true, httpOnly: true });
  });
  it('ignores a nonsense value', async () => {
    process.env.COOKIE_SAMESITE = 'whatever';
    expect((await options()).sameSite).toBe('lax');
  });
});
