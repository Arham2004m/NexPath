import mongoose from 'mongoose';

// One saved roadmap version. Older versions are kept (status 'superseded') so what was planned and when stays reproducible.
const roadmapSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  version: { type: Number, required: true },
  status: { type: String, enum: ['active', 'superseded'], default: 'active' },
  // Everything the plan was generated from; when it changes, a new version is created.
  inputs: {
    goalId: String, subTrack: { type: String, default: null }, hoursPerWeek: Number, targetWeeks: { type: Number, default: null },
    attemptId: String, knownSkills: [String], graphVersion: String, hash: String
  },
  plan: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

roadmapSchema.index({ userId: 1, version: -1 });
// At most one active roadmap per student, even if two requests race to create it.
roadmapSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });

export default mongoose.model('Roadmap', roadmapSchema);
