import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import asyncHandler from '../middleware/asyncHandler.js';
import PasswordReset from '../models/PasswordReset.js';
import User from '../models/User.js';
import { sendMail } from '../services/mailer.js';
import { validateEmail, validatePasswordReset } from '../utils/validators.js';

const HOUR_MS = 3_600_000;
const TOKEN_LIFETIME_MS = HOUR_MS;
const MAX_LINKS_PER_HOUR = 3;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// The same answer whether or not the address belongs to an account, so this cannot be used to find out who has one.
const GENERIC = { message: 'If an account exists for that email, a reset link has been sent. It works for one hour.' };

export const forgotPassword = asyncHandler(async (req, res) => {
  const errors = validateEmail(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the highlighted fields', errors });

  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (user) {
    const recent = await PasswordReset.countDocuments({ userId: user._id, createdAt: { $gte: new Date(Date.now() - HOUR_MS) } });
    if (recent < MAX_LINKS_PER_HOUR) {
      const token = randomBytes(32).toString('base64url');
      await PasswordReset.create({ userId: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS) });
      // The link always points at the configured site, never at whatever host the request claims to be for.
      const link = `${String(process.env.CLIENT_URL).replace(/\/+$/, '')}/reset-password?token=${token}`;
      const message = {
        to: user.email,
        subject: 'Reset your NexPath password',
        text: `Hi ${user.name.split(' ')[0]},\n\nSomeone asked to reset the password for your NexPath account. If that was you, open this link within one hour:\n\n${link}\n\nIf it was not you, ignore this email; your password stays the same.\n\nNexPath`
      };
      // Not awaited: a slow mail server must not slow the answer down (which would also reveal that the account exists).
      sendMail(message).catch((error) => console.error('Could not send the password reset email:', error.message));
    }
  }
  res.json(GENERIC);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const errors = validatePasswordReset(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the highlighted fields', errors });

  // Single use even if two requests arrive together: only one of them can flip usedAt.
  const record = await PasswordReset.findOneAndUpdate(
    { tokenHash: hashToken(req.body.token), usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() }
  );
  if (!record) return res.status(400).json({ code: 'RESET_INVALID', message: 'This reset link is invalid or has expired. Ask for a new one.' });

  const user = await User.findById(record.userId).select('+passwordHash');
  if (!user) return res.status(400).json({ code: 'RESET_INVALID', message: 'This reset link is invalid or has expired. Ask for a new one.' });
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out every device that was signed in
  await user.save();
  await PasswordReset.deleteMany({ userId: user._id }); // any other links for this account are dead too
  res.json({ message: 'Your password has been reset. You can now sign in.' });
});
