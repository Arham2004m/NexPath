// Roadmap generator: knowledge-graph traversal + topological sort + weekly scheduling.
// Deterministic and pure: the same input always yields the same roadmap.
import { capstonesOf, indexNodes, neededClosure, resolveGoalPath } from './graph.js';

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

// A week holds 2-3 topics for a normal 8-15 hour week; heavier weeks (above 15 h) take one more topic per ~5 hours,
// otherwise the plan would stop getting shorter however many hours the student has.
export const weeklyTopicCap = (hoursPerWeek) => (hoursPerWeek <= 15 ? 3 : Math.ceil(hoursPerWeek / 5));

// Greedy packing that keeps every week full: a topic may continue into the next week, but never as a sliver
// smaller than the minimum chunk, and a week holds at most `maxTopics` different topics.
function packWeeks(units, hoursPerWeek, maxTopics) {
  const minChunk = hoursPerWeek <= 4 ? 1 : 2;
  const weeks = [];
  let week = null;
  const open = () => { week = { entries: [], hours: 0, topicIds: new Set() }; weeks.push(week); };
  for (const unit of units) {
    let left = unit.topic.hours;
    unit.weeks = [null, null];
    while (left > 0) {
      if (!week) open();
      const space = hoursPerWeek - week.hours;
      const newTopic = !week.topicIds.has(unit.topic.id);
      // Start a new week when this one is full, has too many topics, or would take only a tiny slice of a longer topic.
      if (space <= 0 || (newTopic && week.topicIds.size >= maxTopics) || (left > space && space < minChunk && week.hours > 0)) { open(); continue; }
      const chunk = Math.min(left, space);
      week.entries.push({ unit, hours: chunk });
      week.hours += chunk;
      week.topicIds.add(unit.topic.id);
      if (unit.weeks[0] === null) unit.weeks[0] = weeks.length;
      unit.weeks[1] = weeks.length;
      left -= chunk;
    }
  }
  return weeks;
}

// Weeks the same units would take at another weekly load (units are copied, so nothing is mutated).
const weeksAt = (units, hours, maxTopicsOverride) => packWeeks(units.map((unit) => ({ ...unit })), hours, maxTopicsOverride ?? weeklyTopicCap(hours)).length;

const baselineHours = (byId, targets) => [...neededClosure(byId, targets, new Set()).needed].reduce((sum, id) => sum + byId.get(id).estimatedHours, 0);

// mastered: skills fully skipped. credits: { nodeId: n } skips the first n topics of a skill that is otherwise planned.
// trims: { nodeId: { topicIndex, hours } } shortens one topic by that many hours (a lighter pass over half-known material).
// sources: { nodeId: 'assessment' | 'self' } says why a skill is known (shown to the student).
// Capstones are never skipped, so a roadmap always has real content.
export function generateRoadmap({
  nodes, goalPaths, goalId, subTrack = null, mastered = [], credits = {}, trims = {}, sources = {}, hoursPerWeek, targetWeeks = null,
  startDate, graphVersion = null, maxTopicsPerWeek = null
}) {
  const path = resolveGoalPath(goalPaths, goalId, subTrack);
  if (!path) throw new RoadmapError('GOAL_NOT_READY', 'A roadmap for this goal is not available yet');
  if (!Number.isInteger(hoursPerWeek) || hoursPerWeek < 1 || hoursPerWeek > MAX_HOURS_PER_WEEK) throw new RoadmapError('INVALID_HOURS', `hoursPerWeek must be 1-${MAX_HOURS_PER_WEEK}`);

  const byId = indexNodes(nodes);
  const capstones = new Set(capstonesOf(path));
  const masteredSet = new Set(mastered.filter((id) => !capstones.has(id)));
  const priority = new Map(path.required.map((id, index) => [id, index]));
  const { needed, known } = neededClosure(byId, path.required, masteredSet);
  const order = topologicalOrder(byId, needed, priority);

  // A skill is never fully credited: at least its last topic stays, and capstones get no credit at all.
  const creditOf = (id) => (capstones.has(id) ? 0 : Math.max(0, Math.min(credits[id] ?? 0, byId.get(id).topics.length - 1)));
  // A trim applies to one topic that is still planned, is not the skill's last topic, and keeps at least one hour.
  const trimOf = (id, index) => {
    const trim = trims[id];
    const topic = byId.get(id).topics[index];
    const valid = trim && !capstones.has(id) && trim.topicIndex === index && index >= creditOf(id) && index < byId.get(id).topics.length - 1 && trim.hours >= 1 && trim.hours < topic.hours;
    return valid ? trim.hours : 0;
  };
  const units = order.flatMap((id) => byId.get(id).topics.map((topic, index) => {
    const trimmed = trimOf(id, index);
    return { node: byId.get(id), topic: trimmed ? { ...topic, hours: topic.hours - trimmed, trimmedHours: trimmed } : topic, index };
  }).slice(creditOf(id)));
  const packed = packWeeks(units, hoursPerWeek, maxTopicsPerWeek ?? weeklyTopicCap(hoursPerWeek));

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
    const credited = isKnown ? 0 : creditOf(id);
    const skippedHours = node.topics.slice(0, credited).reduce((sum, topic) => sum + topic.hours, 0) + node.topics.reduce((sum, _topic, index) => sum + (isKnown ? 0 : trimOf(id, index)), 0);
    return {
      id, name: node.name, domain: node.domain, level: node.level,
      estimatedHours: isKnown ? node.estimatedHours : node.estimatedHours - skippedHours, fullHours: node.estimatedHours,
      // A skill the student already has only links to other known skills, so the tree never shows a known skill below a planned one.
      prerequisites: node.prerequisites.filter((p) => (isKnown ? known.has(p) : included.has(p))),
      status: isKnown ? 'mastered' : span.start === 1 ? 'next' : 'upcoming',
      source: isKnown ? sources[id] || 'assessment' : null,
      creditedTopics: credited, skippedHours,
      order: position, startWeek: isKnown ? null : span.start, endWeek: isKnown ? null : span.end,
      topics: node.topics.map((topic, index) => ({
        id: topic.id, title: topic.title, hours: topic.hours,
        ...(isKnown ? {} : index < credited ? { credited: true } : { startWeek: unitWeeks.get(topic.id)[0], endWeek: unitWeeks.get(topic.id)[1], ...(trimOf(id, index) ? { trimmedHours: trimOf(id, index), plannedHours: topic.hours - trimOf(id, index) } : {}) })
      })),
      miniTasks: node.miniTasks, resources: node.resources, needsReview: !!node.needsReview, capstone: capstones.has(id)
    };
  };
  const knownIds = [...known].sort();
  const roadmapNodes = [...knownIds.map((id) => describe(id, -1)), ...order.map((id, position) => describe(id, position))];
  const edges = roadmapNodes.flatMap((node) => node.prerequisites.map((from) => ({ from, to: node.id })));

  const totalHours = units.reduce((sum, unit) => sum + unit.topic.hours, 0);
  const baseline = baselineHours(byId, path.required);
  const feasible = !targetWeeks || weeks.length <= targetWeeks;
  // The smallest weekly load that really fits the deadline, found by re-planning (not by dividing hours).
  let requiredHoursPerWeek = null;
  if (!feasible) {
    for (let hours = hoursPerWeek + 1; hours <= MAX_HOURS_PER_WEEK; hours++) {
      if (weeksAt(units, hours, maxTopicsPerWeek) <= targetWeeks) { requiredHoursPerWeek = hours; break; }
    }
  }

  return {
    goalId, subTrack, graphVersion, hoursPerWeek, targetWeeks, startDate,
    totalHours, totalWeeks: weeks.length,
    endDate: weeks.length ? weeks[weeks.length - 1].endDate : startDate,
    baselineHours: baseline, hoursSaved: baseline - totalHours,
    feasible, requiredHoursPerWeek, achievable: feasible || requiredHoursPerWeek !== null,
    masteredNodeIds: knownIds, optionalNodeIds: (path.optional || []).filter((id) => !masteredSet.has(id) && !needed.has(id)),
    nodes: roadmapNodes, edges, weeks
  };
}
