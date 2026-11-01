import mongoose from 'mongoose';

// Append-only log: a topic is done or not done by replaying these events, never by editing a flag.
const progressEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roadmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', required: true },
  topicId: { type: String, required: true },
  type: { type: String, enum: ['complete', 'uncomplete', 'time_logged'], required: true },
  minutes: { type: Number, default: 0 },
  at: { type: Date, default: Date.now },
  // The student's local calendar day (YYYY-MM-DD) when it happened; weekly charts group by this, not by UTC.
  day: { type: String, default: null }
});
progressEventSchema.index({ userId: 1, at: 1 });

export default mongoose.model('ProgressEvent', progressEventSchema);
