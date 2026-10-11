import asyncHandler from '../middleware/asyncHandler.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import User from '../models/User.js';
import { loadGraph } from '../services/graphStore.js';
import { masteredNodeIds } from '../engine/mastery.js';
import { generateRoadmap, RoadmapError } from '../engine/generateRoadmap.js';

// Public skeleton of the graph (no resources) for visualisation.
export const graphOverview = (req, res) => {
  const { nodes, graphVersion } = loadGraph();
  res.json({ graphVersion, nodes: nodes.map(({ id, name, domain, level, prerequisites, estimatedHours }) => ({ id, name, domain, level, prerequisites, estimatedHours })) });
};

// Generates (without saving) the roadmap for the signed-in student's goal, time and latest assessment.
export const previewRoadmap = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.goalId) return res.status(400).json({ code: 'GOAL_REQUIRED', message: 'Choose a goal first.' });
  const attempt = await AssessmentAttempt.findOne({ userId: user._id }).sort({ createdAt: -1 });
  if (!attempt) return res.status(400).json({ code: 'ASSESSMENT_REQUIRED', message: 'Take the assessment first.' });

  const { nodes, goalPaths, graphVersion } = loadGraph();
  try {
    const roadmap = generateRoadmap({
      nodes, goalPaths, graphVersion, goalId: user.goalId, subTrack: user.subTrack,
      hoursPerWeek: user.hoursPerWeek, targetWeeks: user.targetWeeks,
      mastered: masteredNodeIds(nodes, attempt.profile, user.subTrack),
      startDate: new Date().toISOString().slice(0, 10)
    });
    res.json({ roadmap });
  } catch (error) {
    if (error instanceof RoadmapError && error.code === 'GOAL_NOT_READY') return res.status(409).json({ code: error.code, message: 'The roadmap for this goal is coming soon. Choose another goal for now.' });
    throw error;
  }
});
