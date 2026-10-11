// Knowledge-graph helpers: indexing, validation and versioning.
// Pure: plain objects in, plain objects out (no Express, Mongoose or file access).
import { createHash } from 'node:crypto';

export const MAX_TOPIC_HOURS = 12;
export const MIN_RESOURCES = 3;

export class GraphError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'GraphError';
    this.errors = errors;
  }
}

export const indexNodes = (nodes) => new Map(nodes.map((node) => [node.id, node]));

// Goal path for a goal (and sub-track), or null when no roadmap is defined for it yet.
export function resolveGoalPath(goalPaths, goalId, subTrack) {
  const goal = goalPaths[goalId];
  if (!goal) return null;
  if (goal.subTracks) return goal.subTracks[subTrack] || null;
  return goal;
}

export function* allGoalPaths(goalPaths) {
  for (const [goalId, goal] of Object.entries(goalPaths)) {
    if (goal.subTracks) for (const [subTrack, path] of Object.entries(goal.subTracks)) yield { goalId, subTrack, path };
    else yield { goalId, subTrack: null, path: goal };
  }
}

// Finds a prerequisite cycle and returns it as an id list ending where it started, or null.
export function findCycle(nodes) {
  const byId = indexNodes(nodes);
  const state = new Map(); // 1 = on the current path, 2 = finished
  const stack = [];
  const visit = (id) => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 1);
    stack.push(id);
    for (const prerequisite of byId.get(id)?.prerequisites || []) {
      if (!byId.has(prerequisite)) continue;
      const cycle = visit(prerequisite);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const node of nodes) {
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }
  return null;
}

// Returns { errors, warnings }. Errors make the graph unusable; warnings are content gaps to review.
export function validateGraph(nodes, goalPaths = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Set();

  for (const node of nodes) {
    if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
    ids.add(node.id);
  }
  for (const node of nodes) {
    const where = `Node ${node.id}`;
    if (![1, 2, 3].includes(node.level)) errors.push(`${where}: level must be 1, 2 or 3`);
    for (const prerequisite of node.prerequisites || []) {
      if (prerequisite === node.id) errors.push(`${where}: lists itself as a prerequisite`);
      else if (!ids.has(prerequisite)) errors.push(`${where}: unknown prerequisite "${prerequisite}"`);
    }
    if (!node.topics?.length) errors.push(`${where}: needs at least one topic`);
    else {
      const sum = node.topics.reduce((total, topic) => total + topic.hours, 0);
      if (sum !== node.estimatedHours) errors.push(`${where}: topic hours add up to ${sum} but estimatedHours is ${node.estimatedHours}`);
      for (const topic of node.topics) {
        if (!(topic.hours > 0 && topic.hours <= MAX_TOPIC_HOURS)) errors.push(`${where}: topic "${topic.id}" must be 1-${MAX_TOPIC_HOURS} hours`);
      }
      if (node.miniTasks?.length !== node.topics.length) errors.push(`${where}: needs one mini task per topic (${node.topics.length}), found ${node.miniTasks?.length ?? 0}`);
    }
    if ((node.resources?.length || 0) < MIN_RESOURCES && !node.needsReview) errors.push(`${where}: fewer than ${MIN_RESOURCES} resources and not flagged needsReview`);
    if (node.needsReview) warnings.push(`${where}: needs more curated resources (${node.resources?.length || 0})`);
  }

  if (!errors.length) {
    const cycle = findCycle(nodes);
    if (cycle) errors.push(`Prerequisite cycle: ${cycle.join(' -> ')}`);
  }

  for (const { goalId, subTrack, path } of allGoalPaths(goalPaths)) {
    const label = subTrack ? `${goalId}/${subTrack}` : goalId;
    if (!path.required?.length) errors.push(`Goal ${label}: no required nodes`);
    for (const id of [...(path.required || []), ...(path.optional || [])]) {
      if (!ids.has(id)) errors.push(`Goal ${label}: unknown node "${id}"`);
    }
  }
  return { errors, warnings };
}

export function assertValidGraph(nodes, goalPaths) {
  const result = validateGraph(nodes, goalPaths);
  if (result.errors.length) throw new GraphError(`Knowledge graph is invalid:\n - ${result.errors.join('\n - ')}`, result.errors);
  return result;
}

// Stable short hash of the graph content; stored on every generated roadmap.
export function computeGraphVersion(nodes, goalPaths) {
  const canonical = JSON.stringify({ nodes: [...nodes].sort((a, b) => a.id.localeCompare(b.id)), goalPaths });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}
