import asyncHandler from '../middleware/asyncHandler.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import User from '../models/User.js';
import { GOALS, HOURS_PER_WEEK, MAX_TARGET_WEEKS } from '../data/goals.js';
import { validateGoalSelection } from '../utils/validators.js';
import { beginnerPlan } from '../services/goalEstimates.js';
import { DOMAIN_LABELS } from '../data/domains.js';
import { recommendGoals } from '../engine/goalRecommender.js';
import { profile } from './authController.js';

// Each goal and sub-track reports what its roadmap costs a beginner: total hours and the real number of weeks at every
// weekly load (`weeksByHours`). `roadmapReady` is false only if the knowledge graph has no path for it.
const estimate = (goalId, subTrack = null) => {
  const plan = beginnerPlan(goalId, subTrack);
  return plan ? { estimatedHours: plan.totalHours, weeksByHours: plan.weeksByHours, roadmapReady: true } : { estimatedHours: null, weeksByHours: null, roadmapReady: false };
};

const withEstimates = () => GOALS.map((goal) => {
  if (!goal.subTracks) return { ...goal, ...estimate(goal.id) };
  const subTracks = goal.subTracks.map((track) => ({ ...track, ...estimate(goal.id, track.id) }));
  const hours = subTracks.map((track) => track.estimatedHours).filter((h) => h !== null);
  return { ...goal, subTracks, roadmapReady: hours.length > 0, estimatedHours: hours.length ? [Math.min(...hours), Math.max(...hours)] : null };
});

export const listGoals = (req, res) => res.json({ goals: withEstimates(), limits: { hoursPerWeek: HOURS_PER_WEEK, maxTargetWeeks: MAX_TARGET_WEEKS } });

export const saveGoal = asyncHandler(async (req, res) => {
  const { goalId, subTrack, hoursPerWeek, targetWeeks } = req.body;
  const errors = validateGoalSelection({ goalId, subTrack, hoursPerWeek, targetWeeks });
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the highlighted fields', errors });

  const user = await User.findById(req.user._id);
  Object.assign(user, { goalId, subTrack: subTrack || null, hoursPerWeek, targetWeeks: targetWeeks ?? null });
  user.onboardingComplete = !!(await AssessmentAttempt.exists({ userId: user._id }));
  await user.save();

  // A deadline shorter than the goal realistically needs is allowed, but the student should know.
  const needed = targetWeeks ? beginnerPlan(goalId, subTrack || null)?.weeksByHours[hoursPerWeek] ?? null : null;
  const warning = needed && targetWeeks < needed
    ? `A beginner needs about ${needed} weeks for this goal at ${hoursPerWeek} hours a week. Your ${targetWeeks}-week target may need more hours (your assessment can shorten it).`
    : null;
  res.json({ user: profile(user), warning });
});

// Ranked goal suggestions from the student's latest assessment (empty until they take one).
export const recommend = asyncHandler(async (req, res) => {
  const attempt = await AssessmentAttempt.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
  if (!attempt) return res.json({ recommendations: [], attemptId: null });
  res.json({ recommendations: recommendGoals(attempt.profile, DOMAIN_LABELS), attemptId: attempt.id });
});
