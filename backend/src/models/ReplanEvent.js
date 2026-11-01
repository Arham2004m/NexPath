import mongoose from 'mongoose';

// One automatic replan: what triggered it (the pace numbers), what changed, and the explanation the student was shown.
// Kept forever: this log is the data behind the paper's evaluation of the adaptive algorithm.
const replanEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromRoadmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', required: true },
  toRoadmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', required: true },
  fromVersion: { type: Number, required: true },
  toVersion: { type: Number, required: true },
  action: { type: String, enum: ['shift', 'enrich'], required: true },
  reason: String,
  // velocity, lagWeeks, weeksEnded, plannedHours, completedHours, pace at the moment of the decision
  metrics: { type: mongoose.Schema.Types.Mixed, required: true },
  // old and new end date and weeks, hours rescheduled or added, deadline outcome
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  // an offer to plan for fewer hours a week (never applied automatically)
  suggestion: { type: mongoose.Schema.Types.Mixed, default: null },
  message: { type: String, required: true },
  // set when the student has read the banner about it
  seenAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

replanEventSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('ReplanEvent', replanEventSchema);
