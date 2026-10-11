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
  // True once the student has both an assessment and a goal.
  onboardingComplete: { type: Boolean, default: false }
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.model('User', userSchema);
