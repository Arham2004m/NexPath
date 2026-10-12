import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  profile: { type: mongoose.Schema.Types.Mixed, required: true },
  questionIds: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Per-question outcomes ({ domain: [{ id, nodeId, difficulty, correct }] }); kept server-side for skill crediting.
  results: { type: mongoose.Schema.Types.Mixed, default: {} },
  timing: { limitSeconds: Number, durationSeconds: Number, timedOut: Boolean }
}, { timestamps: { createdAt: true, updatedAt: false } });
attemptSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('AssessmentAttempt', attemptSchema);
