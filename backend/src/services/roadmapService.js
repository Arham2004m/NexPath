// Saved roadmaps: creates the active version, regenerates it when its inputs change, and computes progress.
import { createHash } from 'node:crypto';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import ProgressEvent from '../models/ProgressEvent.js';
import Roadmap from '../models/Roadmap.js';
import ReplanEvent from '../models/ReplanEvent.js';
import User from '../models/User.js';
import { loadGraph } from './graphStore.js';
import { planMastery } from '../engine/mastery.js';
import { generateRoadmap } from '../engine/generateRoadmap.js';
import { completedTopicIdsFrom, computeProgress } from '../engine/progress.js';
import { REPLAN_COOLDOWN_DAYS, lowVelocitySuggestion, replan } from '../engine/replan.js';

// A reason a roadmap cannot be produced yet, with the HTTP status to answer with.
export class RoadmapProblem extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const utcToday = () => new Date().toISOString().slice(0, 10);
const hashOf = (inputs) => createHash('sha1').update(JSON.stringify(inputs)).digest('hex').slice(0, 16);

async function currentInputs(userId) {
  const user = await User.findById(userId);
  if (!user.goalId) throw new RoadmapProblem('GOAL_REQUIRED', 'Choose a goal first.');
  const attempt = await AssessmentAttempt.findOne({ userId }).sort({ createdAt: -1 });
  if (!attempt) throw new RoadmapProblem('ASSESSMENT_REQUIRED', 'Take the assessment first.');
  const { graphVersion } = loadGraph();
  const inputs = {
    goalId: user.goalId, subTrack: user.subTrack || null, hoursPerWeek: user.hoursPerWeek, targetWeeks: user.targetWeeks ?? null,
    attemptId: attempt.id, knownSkills: [...user.knownSkills].sort(), graphVersion
  };
  return { user, attempt, inputs: { ...inputs, hash: hashOf(inputs) } };
}

async function generate({ user, attempt, inputs }, completedTopicIds, startDate) {
  const { nodes, goalPaths, graphVersion } = loadGraph();
  const { mastered, credits, trims, sources } = planMastery({
    nodes, goalPaths, goalId: inputs.goalId, subTrack: inputs.subTrack,
    profile: attempt.profile, results: attempt.results || {}, selfKnown: user.knownSkills
  });
  return generateRoadmap({
    nodes, goalPaths, graphVersion, goalId: inputs.goalId, subTrack: inputs.subTrack,
    hoursPerWeek: inputs.hoursPerWeek, targetWeeks: inputs.targetWeeks,
    mastered, credits, trims, sources, completedTopicIds, startDate
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The active roadmap. While another request is in the middle of swapping versions there is briefly none, so if the
// student has had roadmaps before, wait a moment for the swap to finish instead of building a duplicate.
async function readActive(userId) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const active = await Roadmap.findOne({ userId, status: 'active' });
    if (active || !(await Roadmap.exists({ userId }))) return active;
    await sleep(30);
  }
  return null;
}

// Replaces `previous` (the version believed to be active) with a new active version. The old one is claimed with a
// conditional update and the unique index allows a single active version, so when two requests race exactly one wins
// and the other gets null (and should look at what is active now). If creating fails, the old version is put back.
async function installVersion({ userId, previous, cause, inputs, plan }) {
  if (previous) {
    const claimed = await Roadmap.updateOne({ _id: previous._id, status: 'active' }, { $set: { status: 'superseded' } });
    if (claimed.modifiedCount !== 1) return null;
  }
  const last = await Roadmap.findOne({ userId }).sort({ version: -1 }).select('version').lean();
  try {
    return await Roadmap.create({ userId, version: (last?.version || 0) + 1, status: 'active', cause, inputs, plan });
  } catch (error) {
    if (error.code === 11000) return null; // someone else already created the active version
    if (previous) await Roadmap.updateOne({ _id: previous._id }, { $set: { status: 'active' } }); // nothing was replaced
    throw error;
  }
}

// The student's active roadmap. A new version is created when none exists, when the goal, hours, target, assessment
// or known skills changed since it was made, or when `force` is set. Finished topics are never scheduled again.
export async function activeRoadmap(userId, { force = false, today = utcToday() } = {}) {
  const context = await currentInputs(userId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const existing = await readActive(userId);
    const unchanged = existing && existing.inputs.hash === context.inputs.hash;
    if (unchanged && !force) return existing;
    // Regenerating identical inputs with no new progress would only pile up identical versions.
    if (unchanged && !(await ProgressEvent.exists({ userId, at: { $gt: existing.createdAt } }))) return existing;

    const events = await ProgressEvent.find({ userId }).sort({ at: 1 }).lean();
    const plan = await generate(context, completedTopicIdsFrom(events), today);
    const created = await installVersion({ userId, previous: existing, cause: 'inputs', inputs: context.inputs, plan });
    if (created) return created;
    // Lost a race to another request: look again and decide on what is active now.
  }
  const active = await readActive(userId);
  if (!active) throw new Error('Could not settle on an active roadmap');
  return active;
}

export async function progressFor(roadmap, today = null) {
  const events = await ProgressEvent.find({ userId: roadmap.userId }).sort({ at: 1 }).lean();
  return computeProgress({ plan: roadmap.plan, events, now: new Date(), today });
}

export const roadmapDto = (roadmap) => ({ id: roadmap.id, version: roadmap.version, createdAt: roadmap.createdAt, plan: roadmap.plan });

// ---- adaptive replanning ----

const DAY_MS = 86_400_000;
const BANNER_DAYS = 14; // an unread explanation stops being shown after two weeks

// What the replanner needs to rebuild this student's roadmap exactly as it was first generated.
async function generationFor(userId) {
  const { user, attempt, inputs } = await currentInputs(userId);
  const { nodes, goalPaths, graphVersion } = loadGraph();
  const mastery = planMastery({
    nodes, goalPaths, goalId: inputs.goalId, subTrack: inputs.subTrack,
    profile: attempt.profile, results: attempt.results || {}, selfKnown: user.knownSkills
  });
  return { nodes, goalPaths, generation: { graphVersion, ...mastery } };
}

// Switches the student to the replanned version (see installVersion for how races are settled).
async function applyReplan({ roadmap, decision }) {
  const created = await installVersion({ userId: roadmap.userId, previous: roadmap, cause: decision.action, inputs: roadmap.inputs, plan: decision.newPlan });
  if (!created) return null;
  const event = await ReplanEvent.create({
    userId: roadmap.userId, fromRoadmapId: roadmap._id, toRoadmapId: created._id, fromVersion: roadmap.version, toVersion: created.version,
    action: decision.action, reason: decision.reason, metrics: decision.metrics, details: decision.details, suggestion: decision.suggestion, message: decision.message
  });
  return { roadmap: created, event };
}

// Looks at the student's pace and, if the rules say so, replans. `ignoreGuard` (a manual request) skips the 7 day wait only;
// the thresholds still apply. Answers { applied, reason }: `applied` is { roadmap, event } when the plan changed.
async function maybeReplan({ userId, roadmap, progress, today, now, ignoreGuard = false }) {
  if (progress.pace !== 'behind' && progress.pace !== 'ahead') return { applied: null, reason: progress.pace === 'complete' ? 'complete' : progress.pace === 'not_started' ? 'first week not over' : 'on track' };
  const last = await ReplanEvent.findOne({ userId }).sort({ createdAt: -1 }).select('createdAt').lean();
  const cooldownActive = !ignoreGuard && !!last && now - last.createdAt < REPLAN_COOLDOWN_DAYS * DAY_MS;
  if (cooldownActive) return { applied: null, reason: 'cooldown' };

  const [{ nodes, goalPaths, generation }, events] = await Promise.all([generationFor(userId), ProgressEvent.find({ userId }).sort({ at: 1 }).lean()]);
  const decision = replan({ nodes, goalPaths, plan: roadmap.plan, progress, today, generation, completedTopicIds: completedTopicIdsFrom(events), cooldownActive: false });
  if (decision.action === 'none') return { applied: null, reason: decision.reason };
  return { applied: await applyReplan({ roadmap, decision }), reason: decision.reason };
}

// The student's active roadmap, replanned if the pace calls for it, with progress, the explanation of any recent change
// and any offer to plan for fewer hours.
export async function currentWithReplan(userId, { today = utcToday(), now = new Date(), ignoreGuard = false } = {}) {
  let roadmap = await activeRoadmap(userId, { today });
  let progress = await progressFor(roadmap, today);
  let replanned = null;

  const { applied, reason } = await maybeReplan({ userId, roadmap, progress, today, now, ignoreGuard });
  if (applied) {
    replanned = applied.event;
    roadmap = applied.roadmap;
    progress = await progressFor(roadmap, today);
  } else if (progress.pace === 'behind' || progress.pace === 'ahead') {
    // Another request may have replanned a moment ago; always answer with whatever is active now.
    const active = await readActive(userId);
    if (active && active.id !== roadmap.id) { roadmap = active; progress = await progressFor(roadmap, today); }
  }
  return { roadmap, progress, replanned, reason, replan: await replanInfo(userId, roadmap, progress, now) };
}

export const eventDto = (event) => ({
  id: event.id, action: event.action, reason: event.reason, message: event.message, metrics: event.metrics, details: event.details,
  suggestion: event.suggestion, fromVersion: event.fromVersion, toVersion: event.toVersion, createdAt: event.createdAt, seenAt: event.seenAt
});

// { event: the newest replan the student has not read yet, suggestion: an offer to lower the weekly hours, if one applies }
export async function replanInfo(userId, roadmap, progress, now = new Date()) {
  const unseen = await ReplanEvent.findOne({ userId, seenAt: null, createdAt: { $gt: new Date(now - BANNER_DAYS * DAY_MS) } }).sort({ createdAt: -1 });
  const live = lowVelocitySuggestion(progress, roadmap.plan.hoursPerWeek);
  const remembered = unseen?.suggestion && unseen.suggestion.hoursPerWeek < roadmap.plan.hoursPerWeek ? unseen.suggestion : null;
  return { event: unseen ? eventDto(unseen) : null, suggestion: live ?? remembered };
}
