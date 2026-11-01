import mongoose from 'mongoose';

// One emailed reset link. Only a hash of the token is stored, so a copy of the database cannot be used to reset anyone's password.
const passwordResetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

// MongoDB removes expired rows by itself.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PasswordReset', passwordResetSchema);
