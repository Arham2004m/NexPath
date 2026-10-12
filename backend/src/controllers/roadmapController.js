import asyncHandler from '../middleware/asyncHandler.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import User from '../models/User.js';
import { loadGraph } from '../services/graphStore.js';
import { planMastery } from '../engine/mastery.js';
import { capstonesOf, resolveGoalPath } from '../engine/graph.js';
import { generateRoadmap, RoadmapError } from '../engine/generateRoadmap.js';

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
