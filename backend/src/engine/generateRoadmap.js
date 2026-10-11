// Roadmap generator: knowledge-graph traversal + topological sort + weekly scheduling.
// Deterministic and pure: the same input always yields the same roadmap.
import { indexNodes, resolveGoalPath } from './graph.js';

export const MAX_HOURS_PER_WEEK = 40;
const DAY_MS = 86_400_000;
const addDays = (isoDate, days) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export class RoadmapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RoadmapError';
    this.code = code;
  }
}

// Everything the goal needs, not descending below skills the student already has.
function closure(byId, targets, mastered) {
  const needed = new Set();
  const known = new Set(); // mastered skills that the path builds on
  const visit = (id) => {
    if (needed.has(id) || known.has(id)) return;
    if (mastered.has(id)) { known.add(id); return; }
    needed.add(id);
    for (const prerequisite of byId.get(id).prerequisites) visit(prerequisite);
  };
  targets.forEach(visit);
  return { needed, known };
}

// Kahn's algorithm. Among ready nodes the choice is deterministic: lower level, then goal priority, then id.
function topologicalOrder(byId, needed, priority) {
  const remaining = new Map([...needed].map((id) => [id, byId.get(id).prerequisites.filter((p) => needed.has(p)).length]));
  const dependents = new Map([...needed].map((id) => [id, []]));
  for (const id of needed) for (const p of byId.get(id).prerequisites) if (needed.has(p)) dependents.get(p).push(id);
  const rank = (id) => [byId.get(id).level, priority.get(id) ?? Number.MAX_SAFE_INTEGER, id];
  const compare = (a, b) => { const [la, pa, ia] = rank(a); const [lb, pb, ib] = rank(b); return la - lb || pa - pb || ia.localeCompare(ib); };

  const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
  const order = [];
  while (ready.length) {
    ready.sort(compare);
    const id = ready.shift();
    order.push(id);
    for (const next of dependents.get(id)) {
      remaining.set(next, remaining.get(next) - 1);
      if (remaining.get(next) === 0) ready.push(next);
    }
  }
  if (order.length !== needed.size) throw new RoadmapError('GRAPH_CYCLE', 'Prerequisite cycle detected while ordering skills');
  return order;
}

// Greedy packing: a topic never splits unless it is longer than a whole week; at most maxTopicsPerWeek per week.
function packWeeks(units, hoursPerWeek, maxTopicsPerWeek) {
  const weeks = [];
  let week = null;
  const open = () => { week = { entries: [], hours: 0, topicIds: new Set() }; weeks.push(week); };
  const place = (unit, hours) => {
    week.entries.push({ unit, hours });
    week.hours += hours;
    week.topicIds.add(unit.topic.id);
  };
  for (const unit of units) {
    const hours = unit.topic.hours;
    if (hours <= hoursPerWeek) {
      if (!week || week.topicIds.size >= maxTopicsPerWeek || week.hours + hours > hoursPerWeek) open();
      place(unit, hours);
      unit.weeks = [weeks.length, weeks.length];
    } else {
      if (!week || week.hours > 0) open();
      let left = hours;
      const first = weeks.length;
      while (left > 0) {
        const chunk = Math.min(left, hoursPerWeek);
        place(unit, chunk);
        left -= chunk;
        if (left > 0) open();
      }
      unit.weeks = [first, weeks.length];
    }
  }
  return weeks;
}

const baselineHours = (byId, targets) => [...closure(byId, targets, new Set()).needed].reduce((sum, id) => sum + byId.get(id).estimatedHours, 0);

export function generateRoadmap({
  nodes, goalPaths, goalId, subTrack = null, mastered = [], hoursPerWeek, targetWeeks = null,
  startDate, graphVersion = null, maxTopicsPerWeek = 3
}) {
  const path = resolveGoalPath(goalPaths, goalId, subTrack);
  if (!path) throw new RoadmapError('GOAL_NOT_READY', 'A roadmap for this goal is not available yet');
  if (!Number.isInteger(hoursPerWeek) || hoursPerWeek < 1 || hoursPerWeek > MAX_HOURS_PER_WEEK) throw new RoadmapError('INVALID_HOURS', `hoursPerWeek must be 1-${MAX_HOURS_PER_WEEK}`);

  const byId = indexNodes(nodes);
  const masteredSet = new Set(mastered);
  const priority = new Map(path.required.map((id, index) => [id, index]));
  const { needed, known } = closure(byId, path.required, masteredSet);
  const order = topologicalOrder(byId, needed, priority);

  const units = order.flatMap((id) => byId.get(id).topics.map((topic, index) => ({ node: byId.get(id), topic, index })));
  const packed = packWeeks(units, hoursPerWeek, maxTopicsPerWeek);

  const weeks = packed.map((week, i) => {
    const touched = [...new Map(week.entries.map(({ unit }) => [unit.node.id, unit.node])).values()];
    const last = week.entries[week.entries.length - 1].unit;
    return {
      index: i + 1,
      startDate: addDays(startDate, i * 7),
      endDate: addDays(startDate, i * 7 + 6),
      plannedHours: week.hours,
      topics: week.entries.map(({ unit, hours }) => ({
        topicId: unit.topic.id, nodeId: unit.node.id, nodeName: unit.node.name, title: unit.topic.title, hours,
        continued: unit.weeks[0] !== i + 1 || unit.weeks[1] !== i + 1
      })),
      miniTask: { nodeId: last.node.id, text: last.node.miniTasks[last.index] ?? last.node.miniTasks[last.node.miniTasks.length - 1] },
      resources: touched.flatMap((node) => node.resources.slice(0, 4).map((resource) => ({ ...resource, nodeId: node.id })))
    };
  });

  const included = new Set([...needed, ...known]);
  const placed = new Map();
  for (const unit of units) {
    const span = placed.get(unit.node.id) || { start: Infinity, end: 0 };
    placed.set(unit.node.id, { start: Math.min(span.start, unit.weeks[0]), end: Math.max(span.end, unit.weeks[1]) });
  }
  const unitWeeks = new Map(units.map((unit) => [unit.topic.id, unit.weeks]));
  const describe = (id, position) => {
    const node = byId.get(id);
    const isKnown = known.has(id);
    const span = placed.get(id);
    return {
      id, name: node.name, domain: node.domain, level: node.level, estimatedHours: node.estimatedHours,
      prerequisites: node.prerequisites.filter((p) => included.has(p)),
      status: isKnown ? 'mastered' : span.start === 1 ? 'next' : 'upcoming',
      order: position, startWeek: isKnown ? null : span.start, endWeek: isKnown ? null : span.end,
      topics: node.topics.map((topic) => ({ id: topic.id, title: topic.title, hours: topic.hours, ...(isKnown ? {} : { startWeek: unitWeeks.get(topic.id)[0], endWeek: unitWeeks.get(topic.id)[1] }) })),
      miniTasks: node.miniTasks, resources: node.resources, needsReview: !!node.needsReview
    };
  };
  const knownIds = [...known].sort();
  const roadmapNodes = [...knownIds.map((id) => describe(id, -1)), ...order.map((id, position) => describe(id, position))];
  const edges = roadmapNodes.flatMap((node) => node.prerequisites.map((from) => ({ from, to: node.id })));

  const totalHours = units.reduce((sum, unit) => sum + unit.topic.hours, 0);
  const baseline = baselineHours(byId, path.required);
  const feasible = !targetWeeks || weeks.length <= targetWeeks;
  const requiredHoursPerWeek = feasible ? null : Math.ceil(totalHours / targetWeeks);

  return {
    goalId, subTrack, graphVersion, hoursPerWeek, targetWeeks, startDate,
    totalHours, totalWeeks: weeks.length,
    endDate: weeks.length ? weeks[weeks.length - 1].endDate : startDate,
    baselineHours: baseline, hoursSaved: baseline - totalHours,
    feasible, requiredHoursPerWeek, achievable: feasible || requiredHoursPerWeek <= MAX_HOURS_PER_WEEK,
    masteredNodeIds: knownIds, optionalNodeIds: (path.optional || []).filter((id) => !masteredSet.has(id) && !needed.has(id)),
    nodes: roadmapNodes, edges, weeks
  };
}
