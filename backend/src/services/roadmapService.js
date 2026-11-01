// Saved roadmaps: creates the active version, regenerates it when its inputs change, and computes progress.
import { createHash } from 'node:crypto';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import ProgressEvent from '../models/ProgressEvent.js';
import Roadmap from '../models/Roadmap.js';
import User from '../models/User.js';
import { loadGraph } from './graphStore.js';
import { planMastery } from '../engine/mastery.js';
import { generateRoadmap } from '../engine/generateRoadmap.js';
import { completedTopicIdsFrom, computeProgress } from '../engine/progress.js';

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

// The student's active roadmap. A new version is created when none exists, when the goal, hours, target, assessment
// or known skills changed since it was made, or when `force` is set. Finished topics are never scheduled again.
export async function activeRoadmap(userId, { force = false, today = utcToday() } = {}) {
  const context = await currentInputs(userId);
  const existing = await Roadmap.findOne({ userId, status: 'active' });
  const unchanged = existing && existing.inputs.hash === context.inputs.hash;
  if (unchanged && !force) return existing;
  // Regenerating identical inputs with no new progress would only pile up identical versions.
  if (unchanged && !(await ProgressEvent.exists({ userId, at: { $gt: existing.createdAt } }))) return existing;

  const events = await ProgressEvent.find({ userId }).sort({ at: 1 }).lean();
  const plan = await generate(context, completedTopicIdsFrom(events), today);
  const last = await Roadmap.findOne({ userId }).sort({ version: -1 }).select('version').lean();

  await Roadmap.updateMany({ userId, status: 'active' }, { $set: { status: 'superseded' } });
  try {
    return await Roadmap.create({ userId, version: (last?.version || 0) + 1, status: 'active', inputs: context.inputs, plan });
  } catch (error) {
    // A parallel request created the active version first; use it.
    if (error.code === 11000) return Roadmap.findOne({ userId, status: 'active' });
    throw error;
  }
}

export async function progressFor(roadmap, today = null) {
  const events = await ProgressEvent.find({ userId: roadmap.userId }).sort({ at: 1 }).lean();
  return computeProgress({ plan: roadmap.plan, events, now: new Date(), today });
}

export const roadmapDto = (roadmap) => ({ id: roadmap.id, version: roadmap.version, createdAt: roadmap.createdAt, plan: roadmap.plan });
