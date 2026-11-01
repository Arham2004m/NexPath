import asyncHandler from '../middleware/asyncHandler.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import User from '../models/User.js';
import { loadGraph } from '../services/graphStore.js';
import { planMastery } from '../engine/mastery.js';
import { capstonesOf, resolveGoalPath } from '../engine/graph.js';
import { generateRoadmap, RoadmapError } from '../engine/generateRoadmap.js';
import ProgressEvent from '../models/ProgressEvent.js';
import { reduceEvents } from '../engine/progress.js';
import { activeRoadmap, progressFor, roadmapDto, RoadmapProblem } from '../services/roadmapService.js';

// Public skeleton of the graph (no resources) for visualisation.
export const graphOverview = (req, res) => {
  const { nodes, graphVersion } = loadGraph();
  res.json({ graphVersion, nodes: nodes.map(({ id, name, domain, level, prerequisites, estimatedHours }) => ({ id, name, domain, level, prerequisites, estimatedHours })) });
};

// Generates (without saving) the roadmap for the signed-in student's goal, time, latest assessment and self-reported skills.
export const previewRoadmap = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.goalId) return res.status(400).json({ code: 'GOAL_REQUIRED', message: 'Choose a goal first.' });
  const attempt = await AssessmentAttempt.findOne({ userId: user._id }).sort({ createdAt: -1 });
  if (!attempt) return res.status(400).json({ code: 'ASSESSMENT_REQUIRED', message: 'Take the assessment first.' });

  const { nodes, goalPaths, graphVersion } = loadGraph();
  try {
    const { mastered, credits, trims, sources } = planMastery({
      nodes, goalPaths, goalId: user.goalId, subTrack: user.subTrack,
      profile: attempt.profile, results: attempt.results || {}, selfKnown: user.knownSkills
    });
    const roadmap = generateRoadmap({
      nodes, goalPaths, graphVersion, goalId: user.goalId, subTrack: user.subTrack,
      hoursPerWeek: user.hoursPerWeek, targetWeeks: user.targetWeeks,
      mastered, credits, trims, sources, startDate: new Date().toISOString().slice(0, 10)
    });
    res.json({ roadmap });
  } catch (error) {
    if (error instanceof RoadmapError && error.code === 'GOAL_NOT_READY') return res.status(409).json({ code: error.code, message: 'The roadmap for this goal is coming soon. Choose another goal for now.' });
    throw error;
  }
});

// Student marks a skill as already known (or undoes it). Capstones cannot be skipped.
export const setKnownSkill = asyncHandler(async (req, res) => {
  const { nodeId, known } = req.body;
  const { nodes, goalPaths } = loadGraph();
  if (typeof nodeId !== 'string' || typeof known !== 'boolean' || !nodes.some((node) => node.id === nodeId)) return res.status(400).json({ message: 'Choose a valid skill.' });

  const user = await User.findById(req.user._id);
  const path = resolveGoalPath(goalPaths, user.goalId, user.subTrack);
  if (known && path && capstonesOf(path).includes(nodeId)) return res.status(400).json({ message: 'This is the final hands-on skill of your path, so it cannot be skipped.' });

  const current = new Set(user.knownSkills);
  if (known) current.add(nodeId); else current.delete(nodeId);
  user.knownSkills = [...current].sort();
  await user.save();
  res.json({ knownSkills: user.knownSkills });
});

// ---- saved roadmap and progress ----

// Turns "cannot make a roadmap yet" problems into the same { code, message } answers the page already understands.
const withProblems = (handler) => asyncHandler(async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    if (error instanceof RoadmapProblem) return res.status(error.status).json({ code: error.code, message: error.message });
    if (error instanceof RoadmapError && error.code === 'GOAL_NOT_READY') return res.status(409).json({ code: error.code, message: 'The roadmap for this goal is coming soon. Choose another goal for now.' });
    throw error;
  }
});

export const currentRoadmap = withProblems(async (req, res) => {
  const roadmap = await activeRoadmap(req.user._id);
  res.json({ roadmap: roadmapDto(roadmap), progress: await progressFor(roadmap) });
});

export const regenerateRoadmap = withProblems(async (req, res) => {
  const roadmap = await activeRoadmap(req.user._id, { force: true });
  res.json({ roadmap: roadmapDto(roadmap), progress: await progressFor(roadmap) });
});

// Tick a topic done (or undo it) and optionally log the time spent. Only topics of the student's own plan are accepted.
export const setTopicProgress = withProblems(async (req, res) => {
  const { done, minutesSpent } = req.body;
  const { topicId } = req.params;
  if (done !== undefined && typeof done !== 'boolean') return res.status(400).json({ message: 'done must be true or false.' });
  if (minutesSpent !== undefined && (!Number.isInteger(minutesSpent) || minutesSpent < 1 || minutesSpent > 1440)) return res.status(400).json({ message: 'minutesSpent must be a whole number between 1 and 1440.' });
  if (done === undefined && minutesSpent === undefined) return res.status(400).json({ message: 'Send done and/or minutesSpent.' });

  const roadmap = await activeRoadmap(req.user._id);
  const inPlan = roadmap.plan.weeks.some((week) => week.topics.some((topic) => topic.topicId === topicId));
  if (!inPlan) return res.status(404).json({ message: 'That topic is not part of your current roadmap.' });

  const events = await ProgressEvent.find({ userId: req.user._id }).sort({ at: 1 }).lean();
  const alreadyDone = reduceEvents(events).done.has(topicId);
  const add = [];
  if (done === true && !alreadyDone) add.push({ type: 'complete' });
  if (done === false && alreadyDone) add.push({ type: 'uncomplete' });
  if (minutesSpent) add.push({ type: 'time_logged', minutes: minutesSpent });
  if (add.length) await ProgressEvent.insertMany(add.map((event) => ({ ...event, userId: req.user._id, roadmapId: roadmap._id, topicId })));
  res.json({ progress: await progressFor(roadmap) });
});

// Everything the progress page needs, without the heavy plan.
export const dashboard = withProblems(async (req, res) => {
  const roadmap = await activeRoadmap(req.user._id);
  const { plan } = roadmap;
  res.json({
    roadmap: { id: roadmap.id, version: roadmap.version, createdAt: roadmap.createdAt, goalId: plan.goalId, subTrack: plan.subTrack, hoursPerWeek: plan.hoursPerWeek, targetWeeks: plan.targetWeeks, startDate: plan.startDate, endDate: plan.endDate, totalWeeks: plan.totalWeeks, totalHours: plan.totalHours },
    progress: await progressFor(roadmap)
  });
});
