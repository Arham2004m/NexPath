import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { validateLogin, validateRegistration } from '../utils/validators.js';
import { createAccessToken, createRefreshToken, refreshCookieOptions } from '../utils/generateTokens.js';

export const profile = (user) => ({ id: user._id, name: user.name, email: user.email, goalId: user.goalId, subTrack: user.subTrack, hoursPerWeek: user.hoursPerWeek, targetWeeks: user.targetWeeks, onboardingComplete: user.onboardingComplete, createdAt: user.createdAt });
const sendSession = (res, user, status = 200) => { res.cookie('refreshToken', createRefreshToken(user.id), refreshCookieOptions).status(status).json({ accessToken: createAccessToken(user.id), user: profile(user) }); };

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  const errors = validateRegistration({ name, email, password, confirmPassword });
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the highlighted fields', errors });
  if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists', errors: { email: 'Email is already registered' } });
  const user = await User.create({ name: name.trim(), email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12) });
  sendSession(res, user, 201);
});
export const login = asyncHandler(async (req, res) => {
  const errors = validateLogin(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the highlighted fields', errors });
  const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) return res.status(401).json({ message: 'Invalid credentials' });
  sendSession(res, user);
});
export const refresh = asyncHandler(async (req, res) => {
  try {
    const { sub } = jwt.verify(req.cookies.refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(sub);
    if (!user) throw new Error();
    res.json({ accessToken: createAccessToken(user.id), user: profile(user) });
  } catch { res.status(401).json({ message: 'Session expired. Please sign in again.' }); }
});
export const logout = (req, res) => { res.clearCookie('refreshToken', refreshCookieOptions); res.status(204).send(); };
export const me = asyncHandler(async (req, res) => res.json({ user: profile(req.user) }));
