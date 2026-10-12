// Beginner-level effort for every goal and sub-track, computed from the knowledge graph so that
// what students see on the goal page always matches the roadmap they will get.
import { loadGraph } from './graphStore.js';
import { generateRoadmap } from '../engine/generateRoadmap.js';
import { resolveGoalPath } from '../engine/graph.js';
import { HOURS_PER_WEEK } from '../data/goals.js';

const cache = new Map();

// { totalHours, weeksByHours: { [hoursPerWeek]: weeks } } for someone starting from zero, or null when the graph
// has no path for the goal yet. Weeks come from really re-planning at each weekly load, not from dividing hours.
export function beginnerPlan(goalId, subTrack = null) {
  const { nodes, goalPaths, graphVersion } = loadGraph();
  const key = `${graphVersion}:${goalId}:${subTrack}`;
  if (cache.has(key)) return cache.get(key);
  let plan = null;
  if (resolveGoalPath(goalPaths, goalId, subTrack)) {
    const weeksByHours = {};
    let totalHours = 0;
    for (let hours = HOURS_PER_WEEK.min; hours <= HOURS_PER_WEEK.max; hours++) {
      const roadmap = generateRoadmap({ nodes, goalPaths, goalId, subTrack, mastered: [], hoursPerWeek: hours, startDate: '2026-01-05' });
      weeksByHours[hours] = roadmap.totalWeeks;
      totalHours = roadmap.totalHours;
    }
    plan = { totalHours, weeksByHours };
  }
  cache.set(key, plan);
  return plan;
}
