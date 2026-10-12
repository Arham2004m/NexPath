import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  domain: { type: String, required: true, index: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  // The skill this question tests (a knowledge-graph node id); used to credit specific skills.
  nodeId: { type: String, default: null },
  question: { type: String, required: true },
  options: { type: [String], required: true },
  // Never returned unless a query explicitly selects it (scoring only).
  correct: { type: Number, required: true, select: false }
});

export default mongoose.model('Question', questionSchema);
