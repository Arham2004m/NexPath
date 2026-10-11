import asyncHandler from '../middleware/asyncHandler.js';
import Question from '../models/Question.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import { DOMAIN_KEYS, DOMAIN_LABELS } from '../data/domains.js';
import { sampleDomain } from '../services/assessment/sampler.js';
import { scoreDomain } from '../services/assessment/scoring.js';

const MAX_QUESTIONS_PER_DOMAIN = 10;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const bad = (res, message) => res.status(400).json({ message });

export const listDomains = asyncHandler(async (req, res) => {
  // Bank sizes are deliberately not exposed to students.
  res.json({ domains: DOMAIN_KEYS.map((key) => ({ key, label: DOMAIN_LABELS[key] })) });
});

// questionId -> when this user last saw it, from their saved attempts.
async function seenQuestions(userId) {
  const seen = new Map();
  const attempts = await AssessmentAttempt.find({ userId }).select('questionIds createdAt').lean();
  for (const attempt of attempts) {
    const at = attempt.createdAt?.getTime() || 0;
    for (const ids of Object.values(attempt.questionIds || {})) {
      for (const id of ids) seen.set(id, Math.max(seen.get(id) || 0, at));
    }
  }
  return seen;
}

export const sampleQuestions = asyncHandler(async (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains) || !domains.length || domains.some((d) => !DOMAIN_KEYS.includes(d))) return bad(res, 'Provide a list of valid domains');
  const seen = await seenQuestions(req.user._id);
  const questions = {};
  for (const key of new Set(domains)) {
    const pool = await Question.find({ domain: key }).lean(); // `correct` is select:false, so never sent
    questions[key] = sampleDomain(pool, undefined, seen).map(({ id, difficulty, question, options }) => ({ id, difficulty, question, options }));
  }
  res.json({ questions });
});

export const submitAttempt = asyncHandler(async (req, res) => {
  const { skippedDomains = [], shownQuestions = {}, answers = {}, timing } = req.body;
  if (!Array.isArray(skippedDomains) || !isPlainObject(shownQuestions) || !isPlainObject(answers)) return bad(res, 'Invalid submission');
  if (skippedDomains.some((d) => !DOMAIN_KEYS.includes(d))) return bad(res, 'Invalid skipped domain');

  const profile = {};
  const questionIds = {};
  for (const key of DOMAIN_KEYS) {
    if (skippedDomains.includes(key)) {
      profile[key] = { label: DOMAIN_LABELS[key], band: 'Beginner', assessmentMethod: 'self-reported' };
      continue;
    }
    const ids = shownQuestions[key];
    if (ids === undefined) continue; // domain not reached (e.g. timer ran out)
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_QUESTIONS_PER_DOMAIN || ids.some((id) => typeof id !== 'string')) return bad(res, `Invalid questions for ${key}`);

    // Authoritative questions (with correct answers) come from the DB; ids must belong to this domain.
    const questions = await Question.find({ domain: key, id: { $in: ids } }).select('+correct').lean();
    if (questions.length !== new Set(ids).size) return bad(res, `Unknown questions for ${key}`);
    questionIds[key] = questions.map((q) => q.id);
    profile[key] = { label: DOMAIN_LABELS[key], ...scoreDomain(questions, isPlainObject(answers[key]) ? answers[key] : {}), assessmentMethod: 'tested' };
  }
  if (!Object.keys(profile).length) return bad(res, 'Nothing to score');

  const attempt = await AssessmentAttempt.create({
    userId: req.user._id,
    profile,
    questionIds,
    ...(isPlainObject(timing) ? { timing: { limitSeconds: Number(timing.limitSeconds) || null, durationSeconds: Number(timing.durationSeconds) || 0, timedOut: timing.timedOut === true } } : {})
  });
  res.status(201).json({ attempt: toAttempt(attempt, req.user) });
});

export const latestAttempt = asyncHandler(async (req, res) => {
  const attempt = await AssessmentAttempt.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ attempt: attempt ? toAttempt(attempt, req.user) : null });
});

// Same shape the frontend results screen already consumes.
const toAttempt = (attempt, user) => ({
  id: attempt.id,
  name: user.name,
  timestamp: attempt.createdAt.toISOString(),
  profile: attempt.profile,
  questionIds: attempt.questionIds,
  timing: attempt.timing
});
