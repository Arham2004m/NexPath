import mongoose from 'mongoose';

// The question set last handed to a student for each domain. Scoring only accepts that exact set, so a student cannot
// choose which questions to be judged on.
const issuedSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, required: true },
  questionIds: { type: [String], required: true },
  issuedAt: { type: Date, default: Date.now }
});
issuedSchema.index({ userId: 1, domain: 1 }, { unique: true });

export default mongoose.model('IssuedQuestions', issuedSchema);
