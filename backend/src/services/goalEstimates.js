// Beginner-level effort for every goal and sub-track, computed from the knowledge graph so that
// what students see on the goal page always matches the roadmap they will get.
import { loadGraph } from './graphStore.js';
import { generateRoadmap } from '../engine/generateRoadmap.js';
import { resolveGoalPath } from '../engine/graph.js';

const cache = new Map();

// Total hours for someone starting from zero, or null when the graph has no path for the goal yet.
export function beginnerHours(goalId, subTrack = null) {
  const { nodes, goalPaths, graphVersion } = loadGraph();
  const key = `${graphVersion}:${goalId}:${subTrack}`;
  if (cache.has(key)) return cache.get(key);
  const hours = resolveGoalPath(goalPaths, goalId, subTrack)
    ? generateRoadmap({ nodes, goalPaths, goalId, subTrack, mastered: [], hoursPerWeek: 10, startDate: '2026-01-05' }).totalHours
    : null;
  cache.set(key, hours);
  return hours;
}
