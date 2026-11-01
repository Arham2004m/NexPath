import mongoose from 'mongoose';

// One line of a student's conversation with the mentor.
// status: 'pending' while being answered, 'ok' when answered, 'failed' when no answer could be produced,
// 'blocked' for a message the guardrails answered with a fixed reply (never sent to the model, never sent back to it as history).
const chatMessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, default: 'main', maxlength: 64 },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 8000 },
  status: { type: String, enum: ['pending', 'ok', 'failed', 'blocked'], default: 'ok' }
}, { timestamps: { createdAt: true, updatedAt: false } });

chatMessageSchema.index({ userId: 1, _id: -1 });
chatMessageSchema.index({ userId: 1, role: 1, createdAt: -1 });

export default mongoose.model('ChatMessage', chatMessageSchema);
