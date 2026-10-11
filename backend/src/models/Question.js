import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  domain: { type: String, required: true, index: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  question: { type: String, required: true },
  options: { type: [String], required: true },
  // Never returned unless a query explicitly selects it (scoring only).
  correct: { type: Number, required: true, select: false }
});

export default mongoose.model('Question', questionSchema);
