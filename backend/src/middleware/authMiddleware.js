import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import asyncHandler from './asyncHandler.js';

export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication required' });
  try {
    const { sub, v } = jwt.verify(header.slice(7), process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(sub);
    if (!user || (v ?? 0) !== (user.tokenVersion ?? 0)) return res.status(401).json({ message: 'Authentication required' });
    req.user = user;
    next();
  } catch { res.status(401).json({ message: 'Authentication required' }); }
});
