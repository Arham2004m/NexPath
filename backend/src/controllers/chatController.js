import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import ChatMessage from '../models/ChatMessage.js';
import ReplanEvent from '../models/ReplanEvent.js';
import Roadmap from '../models/Roadmap.js';
import { buildContents, buildContext, systemInstruction } from '../ai/prompt.js';
import { cleanInput, HOLDBACK, leaksPrompt, REPLIES, screen } from '../ai/guardrails.js';
import { getProvider, ProviderError } from '../ai/provider.js';
import { progressFor } from '../services/roadmapService.js';

const HOUR_MS = 3_600_000;
const STORED_LIMIT = 200; // messages kept per student; older ones are dropped
const ANSWER_TIMEOUT_MS = 60_000;
const HISTORY_FOR_MODEL = 10;

export const rateLimitPerHour = () => {
  const value = Number(process.env.CHAT_RATE_LIMIT_PER_HOUR);
  return Number.isInteger(value) && value > 0 ? value : 20;
};

const FAILURES = {
  not_configured: 'The AI mentor is not set up on this server yet.',
  quota: 'The mentor is very busy right now. Please try again in a few minutes.',
  blocked: 'I can\'t help with that one. Ask me about your roadmap, your topics or your career plan.',
  auth: 'The mentor is unavailable right now. Please try again later.',
  unavailable: 'The mentor could not answer just now. Please try again.',
  aborted: 'The reply was stopped.'
};

export const messageDto = (message) => ({ id: message.id, role: message.role, content: message.content, status: message.status, createdAt: message.createdAt });

// Students with a reply being written right now (one at a time each). Lives in this process.
const inFlight = new Set();

// Read-only: building the context must never create, replace or touch a roadmap.
async function contextFor(user, today) {
  try {
    const [roadmap, attempt, replan] = await Promise.all([
      Roadmap.findOne({ userId: user._id, status: 'active' }).lean(),
      AssessmentAttempt.findOne({ userId: user._id }).sort({ createdAt: -1 }).select('profile').lean(),
      ReplanEvent.findOne({ userId: user._id, createdAt: { $gte: new Date(Date.now() - 14 * 24 * HOUR_MS) } }).sort({ createdAt: -1 }).select('message').lean()
    ]);
    const progress = roadmap ? await progressFor(roadmap, today) : null;
    return buildContext({ user, profile: attempt?.profile, plan: roadmap?.plan, progress, replan });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Mentor context failed:', error.message);
    return '';
  }
}

// Keeps only the newest STORED_LIMIT messages of a student.
async function trim(userId) {
  const oldest = await ChatMessage.find({ userId }).sort({ _id: -1 }).skip(STORED_LIMIT).limit(1).select('_id').lean();
  if (oldest.length) await ChatMessage.deleteMany({ userId, _id: { $lte: oldest[0]._id } });
}

export const sendMessage = asyncHandler(async (req, res) => {
  const input = cleanInput(req.body?.message);
  if (!input.ok) return res.status(400).json({ message: input.message });
  const userId = req.user._id;
  const key = String(userId);

  if (inFlight.has(key)) return res.status(409).json({ code: 'BUSY', message: 'Wait for the current reply to finish first.' });
  inFlight.add(key);
  let controller = null;
  let timer = null;
  let question = null;
  try {
    // Only messages that were answered (or are being answered) count against the hourly allowance.
    const limit = rateLimitPerHour();
    const since = new Date(Date.now() - HOUR_MS);
    const counted = await ChatMessage.find({ userId, role: 'user', status: { $in: ['ok', 'pending'] }, createdAt: { $gte: since } }).sort({ createdAt: 1 }).select('createdAt').lean();
    if (counted.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((counted[counted.length - limit].createdAt.getTime() + HOUR_MS - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ code: 'RATE_LIMITED', message: `You have reached the limit of ${limit} mentor messages per hour. Try again in about ${Math.ceil(retryAfterSeconds / 60)} minute(s).`, retryAfterSeconds });
    }

    const verdict = screen(input.text);
    const sessionId = typeof req.body?.sessionId === 'string' && /^[\w-]{1,64}$/.test(req.body.sessionId) ? req.body.sessionId : 'main';
    question = await ChatMessage.create({ userId, sessionId, role: 'user', content: input.text, status: verdict === 'ok' ? 'pending' : 'blocked' });

    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = (event, data) => { if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    send('start', { id: question.id });

    // Fixed replies (guardrails) never reach the model.
    if (verdict !== 'ok') {
      const reply = await ChatMessage.create({ userId, sessionId, role: 'assistant', content: REPLIES[verdict], status: 'blocked' });
      send('done', { message: messageDto(reply), question: messageDto(question) });
      return res.end();
    }

    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), ANSWER_TIMEOUT_MS);
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });

    let text = '';
    let shown = 0;
    let failure = null;
    try {
      const [context, stored] = await Promise.all([
        contextFor(req.user, req.today),
        ChatMessage.find({ userId, _id: { $lt: question._id }, status: 'ok' }).sort({ _id: -1 }).limit(HISTORY_FOR_MODEL).lean()
      ]);
      const contents = buildContents(stored.reverse(), input.text, HISTORY_FOR_MODEL);
      for await (const piece of getProvider().stream({ system: systemInstruction(context), contents, signal: controller.signal })) {
        text += piece;
        if (leaksPrompt(text)) break;
        const safeEnd = text.length - HOLDBACK;
        if (safeEnd > shown) { send('delta', { text: text.slice(shown, safeEnd) }); shown = safeEnd; }
      }
      if (controller.signal.aborted) throw new ProviderError('aborted');
    } catch (error) {
      failure = error instanceof ProviderError ? error : new ProviderError('unavailable', error?.name);
    }

    const leaked = leaksPrompt(text);
    // The held-back tail was only a precaution against a split marker; with no marker it is ordinary text.
    if (!failure && !leaked && text.length > shown) { send('delta', { text: text.slice(shown) }); shown = text.length; }
    const clientGone = failure?.code === 'aborted' && res.destroyed;
    if (failure && !(failure.code === 'aborted' && text.trim())) {
      if (failure.code === 'auth' || failure.code === 'unavailable') { if (process.env.NODE_ENV !== 'test') console.error(`Mentor provider failed: ${failure.code} (${failure.message})`); }
      await ChatMessage.updateOne({ _id: question._id }, { status: 'failed' });
      if (!clientGone) send('error', { code: failure.code, message: FAILURES[failure.code] || FAILURES.unavailable });
      return res.end();
    }

    // A finished answer, a stopped one that already has text, or one that repeated the instructions (replaced).
    const content = leaked ? REPLIES.leaked : text.trim();
    if (!content) {
      await ChatMessage.updateOne({ _id: question._id }, { status: 'failed' });
      send('error', { code: 'unavailable', message: FAILURES.unavailable });
      return res.end();
    }
    const [reply] = await Promise.all([
      ChatMessage.create({ userId, sessionId, role: 'assistant', content: content.slice(0, 8000), status: leaked ? 'blocked' : 'ok' }),
      ChatMessage.updateOne({ _id: question._id }, { status: leaked ? 'blocked' : 'ok' })
    ]);
    await trim(userId);
    send('done', { message: messageDto(reply), question: { ...messageDto(question), status: leaked ? 'blocked' : 'ok' } });
    res.end();
  } catch (error) {
    // Once the stream has started the usual error page can no longer be sent, so finish it as a stream error.
    if (!res.headersSent) throw error;
    console.error('Mentor request failed:', error);
    if (question) await ChatMessage.updateOne({ _id: question._id, status: 'pending' }, { status: 'failed' }).catch(() => {});
    if (!res.writableEnded) { res.write(`event: error
data: ${JSON.stringify({ code: 'unavailable', message: FAILURES.unavailable })}

`); res.end(); }
  } finally {
    clearTimeout(timer);
    inFlight.delete(key);
  }
});

// Newest first on the server, returned oldest to newest so the page can render it directly.
export const history = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  const query = { userId: req.user._id };
  if (req.query.before !== undefined) {
    if (typeof req.query.before !== 'string' || !mongoose.isValidObjectId(req.query.before)) return res.status(400).json({ message: 'Invalid cursor.' });
    query._id = { $lt: req.query.before };
  }
  const found = await ChatMessage.find(query).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = found.length > limit;
  const page = found.slice(0, limit).reverse();
  res.json({ messages: page.map(messageDto), hasMore, nextBefore: hasMore ? page[0].id : null });
});

export const clearHistory = asyncHandler(async (req, res) => {
  if (inFlight.has(String(req.user._id))) return res.status(409).json({ code: 'BUSY', message: 'Wait for the current reply to finish first.' });
  const { deletedCount } = await ChatMessage.deleteMany({ userId: req.user._id });
  res.json({ deleted: deletedCount });
});
