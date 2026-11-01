import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { validateLogin, validateNameChange, validatePasswordChange, validateRegistration } from '../utils/validators.js';
import { createAccessToken, createRefreshToken, refreshCookieOptions } from '../utils/generateTokens.js';

// A real-looking hash to compare against when the email is unknown, so a missing account takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

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
  const matches = await bcrypt.compare(req.body.password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !matches) return res.status(401).json({ message: 'Invalid credentials' });
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
// clearCookie must not receive maxAge (deprecated in Express 4, ignored in 5).
const { maxAge: _maxAge, ...clearCookieOptions } = refreshCookieOptions;
export const logout = (req, res) => { res.clearCookie('refreshToken', clearCookieOptions); res.status(204).send(); };
export const me = asyncHandler(async (req, res) => res.json({ user: profile(req.user) }));

export const updateName = asyncHandler(async (req, res) => {
  const errors = validateNameChange(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the highlighted fields', errors });
  req.user.name = req.body.name.trim();
  await req.user.save();
  res.json({ user: profile(req.user) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const errors = validatePasswordChange(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the highlighted fields', errors });
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) return res.status(400).json({ message: 'Please correct the highlighted fields', errors: { currentPassword: 'That is not your current password' } });
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await user.save();
  res.json({ message: 'Your password has been changed.' });
});
