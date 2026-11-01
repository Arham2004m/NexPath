import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  // Goal selection (validated against data/goals.js).
  goalId: { type: String, default: null },
  subTrack: { type: String, default: null },
  hoursPerWeek: { type: Number, default: null },
  targetWeeks: { type: Number, default: null },
  // Skills the student says they already know (knowledge-graph node ids); skipped in their roadmap.
  knownSkills: { type: [String], default: [] },
  // True once the student has both an assessment and a goal.
  onboardingComplete: { type: Boolean, default: false },
  // Raised whenever the password changes; sign-in tokens carry the number they were issued under, so older ones stop working.
  tokenVersion: { type: Number, default: 0 }
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.model('User', userSchema);
