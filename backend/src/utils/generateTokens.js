import jwt from 'jsonwebtoken';

export const createAccessToken = (userId, version = 0) => jwt.sign({ sub: userId, v: version }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
export const createRefreshToken = (userId, version = 0) => jwt.sign({ sub: userId, v: version }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
// COOKIE_SAMESITE=none is needed when the website and the API are on different domains (e.g. Vercel + Render); the cookie
// must then be Secure (HTTPS). The default, lax, is right when both are served from one site or run locally.
const requested = String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
const sameSite = ['lax', 'strict', 'none'].includes(requested) ? requested : 'lax';
export const refreshCookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === 'production' || sameSite === 'none', sameSite, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth'
};
