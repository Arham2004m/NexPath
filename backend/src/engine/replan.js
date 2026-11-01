// Adaptive replanning (the research contribution). Pure: no database, clock or HTTP, so the same function runs in the
// app, in the tests and in the offline simulation used for the paper.
//
// Rules (handoff section 7.3), applied to the learning velocity measured by engine/progress.js:
//   lagWeeks >= 2   SHIFT   re-pack every unfinished topic starting today; the end date moves forward.
//   lagWeeks <= -1  ENRICH  add optional advanced topics, up to the hours the student is ahead by.
//   velocity < 0.6 for 3 weeks in a row  SUGGEST  planning for fewer hours a week (never applied silently).
//   otherwise       no change.
// Guards: at most one automatic replan per 7 days; finished topics are never moved or removed; an enrichment never
// changes the finish date, the pace or the percentage.
import { generateRoadmap } from './generateRoadmap.js';
import { resolveGoalPath } from './graph.js';
import { LAG_BEHIND_WEEKS } from './progress.js';

export const REPLAN_COOLDOWN_DAYS = 7;
export const LOW_VELOCITY = 0.6;
export const LOW_VELOCITY_WEEKS = 3;
export const MIN_EXTRA_HOURS = 2; // not worth adding extras smaller than this

const DAY_MS = 86_400_000;
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const diffDays = (later, earlier) => dayNumber(later) - dayNumber(earlier);
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const prettyDate = (iso) => dateFormat.format(new Date(`${iso}T00:00:00Z`));
const round = (value, places = 1) => Number(value.toFixed(places));
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The pace numbers a decision is based on, kept with every replan for the paper.
export const metricsOf = (progress) => ({
  velocity: progress.velocity, lagWeeks: progress.lagWeeks, leadHours: progress.leadHours, weeksEnded: progress.weeksEnded,
  plannedHours: progress.endedPlannedHours, completedHours: progress.completedPlanHours, pace: progress.pace
});

// Three finished weeks in a row below 60% of their plan: suggest a weekly load that matches what is really happening.
export function lowVelocitySuggestion(progress, hoursPerWeek) {
  const ended = (progress.weekly || []).filter((week) => week.state === 'ended');
  if (ended.length < LOW_VELOCITY_WEEKS) return null;
  const recent = ended.slice(-LOW_VELOCITY_WEEKS);
  if (!recent.every((week) => week.plannedHours > 0 && week.completionRate < LOW_VELOCITY)) return null;
  const average = recent.reduce((sum, week) => sum + week.completedHours, 0) / LOW_VELOCITY_WEEKS;
  // With almost no activity the data says nothing about capacity, so offer half the current load instead of the minimum.
  const basis = average >= 1 ? average : hoursPerWeek / 2;
  const suggested = Math.max(3, Math.ceil(basis));
  if (suggested >= hoursPerWeek) return null;
  return { hoursPerWeek: suggested, currentHoursPerWeek: hoursPerWeek, averageCompletedHours: round(average), weeks: LOW_VELOCITY_WEEKS };
}

// ---- optional extras ----

// Optional skills whose prerequisites the student has met, as topics, up to `budgetHours`. Already added topics are kept.
function chooseExtras({ nodes, goalPaths, plan, progress, generation, budgetHours }) {
  const path = resolveGoalPath(goalPaths, plan.goalId, plan.subTrack);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const planNodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const existing = plan.extras?.topics || [];
  const existingIds = new Set(existing.map((topic) => topic.topicId));
  const extraNodeComplete = (id) => !!progress.extras?.nodes?.[id]?.complete;
  // Skills the student already has (from the assessment or marked by them), even when they are not on this goal's path.
  const known = new Set(generation?.mastered || []);
  // A prerequisite is met when the skill was already known, finished earlier, completed in this plan, or finished as an extra.
  const met = (id) => {
    if (known.has(id)) return true;
    const node = planNodes.get(id);
    if (node) return node.status === 'mastered' || node.status === 'done' || !!progress.nodes?.[id]?.complete;
    return extraNodeComplete(id);
  };

  const added = [];
  let remaining = budgetHours;
  for (const id of path?.optional || []) {
    const node = byId.get(id);
    if (!node || planNodes.has(id) || known.has(id)) continue; // already part of the path, or already known
    if (!node.prerequisites.every(met)) continue;
    const credited = generation?.credits?.[id] ?? 0; // the first topics were already covered by the student's score
    for (let index = credited; index < node.topics.length; index++) {
      const topic = node.topics[index];
      if (existingIds.has(topic.id)) continue;
      if (topic.hours > remaining) break; // topics of a skill go in order, so stop at the first that does not fit
      added.push({ topicId: topic.id, nodeId: node.id, nodeName: node.name, title: topic.title, hours: topic.hours, index });
      remaining -= topic.hours;
    }
  }
  return added;
}

// Rebuilds the extras block (topics, skills for the tree, and prerequisite edges) from the list of extra topics.
export function buildExtras({ nodes, plan, topics, addedAt }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const planIds = new Set(plan.nodes.map((node) => node.id));
  const order = [...new Set(topics.map((topic) => topic.nodeId))];
  const extraNodes = order.map((nodeId, position) => {
    const node = byId.get(nodeId);
    const mine = topics.filter((topic) => topic.nodeId === nodeId).sort((a, b) => a.index - b.index);
    return {
      id: node.id, name: node.name, domain: node.domain, level: node.level, status: 'optional', optional: true, source: null, capstone: false,
      prerequisites: node.prerequisites.filter((id) => planIds.has(id) || order.includes(id)),
      estimatedHours: mine.reduce((sum, topic) => sum + topic.hours, 0), fullHours: node.estimatedHours, completedHours: 0, skippedHours: 0, creditedTopics: 0,
      order: 1000 + position, startWeek: null, endWeek: null, needsReview: !!node.needsReview,
      topics: mine.map((topic) => ({ id: topic.topicId, title: topic.title, hours: topic.hours })),
      miniTasks: mine.map((topic) => node.miniTasks[topic.index] ?? ''),
      resources: node.resources
    };
  });
  const edges = extraNodes.flatMap((node) => node.prerequisites.map((from) => ({ from, to: node.id })));
  return { addedAt, topics, nodes: extraNodes, edges };
}

// ---- the decision ----

export const NO_CHANGE = {
  complete: 'Every topic of this roadmap is finished, so there is nothing to adapt.',
  cooldown: 'Your plan already changed in the last 7 days, so it is left alone for now.',
  'first week not over': 'Your first week is not over yet, so there is no pace to measure.',
  'on track': 'You are keeping up with the plan, so nothing needed to change.',
  'nothing left to reschedule': 'There is nothing left to reschedule.',
  'enough extras already': 'You already have optional extras waiting, so no more were added.',
  'no optional topics available': 'You are ahead, but no optional topics are unlocked for you yet.'
};
const none = (reason, progress, suggestion) => ({ action: 'none', reason, metrics: metricsOf(progress), suggestion, newPlan: null, details: null, message: NO_CHANGE[reason] ?? 'Your plan is unchanged.' });

// replan({ nodes, goalPaths, plan, progress, today, generation, completedTopicIds, cooldownActive })
//   plan             the saved plan of the active roadmap version
//   progress         computeProgress() for that plan
//   today            the student's calendar day (YYYY-MM-DD)
//   generation       { graphVersion, mastered, credits, trims, sources }: how this student's roadmap is generated
//   completedTopicIds  every topic the student has finished
//   cooldownActive   true when an automatic replan already happened in the last 7 days
// Returns { action: 'none' | 'shift' | 'enrich', reason, metrics, suggestion, newPlan, details, message }.
export function replan({ nodes, goalPaths, plan, progress, today, generation, completedTopicIds = [], cooldownActive = false }) {
  const suggestion = lowVelocitySuggestion(progress, plan.hoursPerWeek);
  if (progress.pace === 'complete') return none('complete', progress, null);
  if (cooldownActive) return none('cooldown', progress, suggestion);
  const lag = progress.lagWeeks;
  if (lag === null) return none('first week not over', progress, suggestion);

  if (lag >= LAG_BEHIND_WEEKS) return shift({ nodes, goalPaths, plan, progress, today, generation, completedTopicIds, suggestion });
  if (progress.pace === 'ahead') return enrich({ nodes, goalPaths, plan, progress, today, generation, suggestion });
  return none('on track', progress, suggestion);
}

function shift({ nodes, goalPaths, plan, progress, today, generation, completedTopicIds, suggestion }) {
  const unfinished = progress.topicsTotal - progress.topicsDone;
  if (unfinished === 0) return none('nothing left to reschedule', progress, suggestion);

  // The deadline the student set stays where it was; only the weeks left until it shrink.
  const originalDeadline = plan.deadlineDate ?? (plan.targetWeeks ? addDays(plan.startDate, plan.targetWeeks * 7) : null);
  let targetWeeks = null;
  let deadlinePassed = false;
  if (originalDeadline) {
    const weeksLeft = Math.floor(diffDays(originalDeadline, today) / 7);
    if (weeksLeft >= 1) targetWeeks = weeksLeft; else deadlinePassed = true;
  }

  const newPlan = generateRoadmap({
    nodes, goalPaths, graphVersion: generation.graphVersion, goalId: plan.goalId, subTrack: plan.subTrack,
    hoursPerWeek: plan.hoursPerWeek, targetWeeks, deadlineDate: targetWeeks ? originalDeadline : null,
    mastered: generation.mastered, credits: generation.credits, trims: generation.trims, sources: generation.sources,
    completedTopicIds, startDate: today
  });
  if (newPlan.weeks.length === 0) return none('nothing left to reschedule', progress, suggestion);

  const behind = round(progress.lagWeeks);
  const details = {
    oldEndDate: plan.endDate, newEndDate: newPlan.endDate, oldTotalWeeks: plan.totalWeeks, newTotalWeeks: newPlan.totalWeeks,
    rescheduledTopics: unfinished, rescheduledHours: newPlan.totalHours, startDate: today,
    deadline: originalDeadline ? { date: originalDeadline, passed: deadlinePassed, feasible: newPlan.feasible, requiredHoursPerWeek: newPlan.requiredHoursPerWeek } : null
  };
  let message = `You were ${behind} weeks behind schedule, so your ${plural(unfinished, 'unfinished topic')} (${newPlan.totalHours} h) ${unfinished === 1 ? 'was' : 'were'} rescheduled starting today. Your finish date moved from ${prettyDate(plan.endDate)} to ${prettyDate(newPlan.endDate)}. Nothing you finished was changed.`;
  if (deadlinePassed) message += ` Your target date (${prettyDate(originalDeadline)}) has passed or is too close, so the new plan no longer measures against it.`;
  else if (originalDeadline && !newPlan.feasible) message += newPlan.requiredHoursPerWeek
    ? ` To still finish by ${prettyDate(originalDeadline)} you would need about ${newPlan.requiredHoursPerWeek} hours a week.`
    : ` Even at the maximum weekly hours, finishing by ${prettyDate(originalDeadline)} is no longer possible.`;
  else if (originalDeadline) message += ` You can still finish before ${prettyDate(originalDeadline)}.`;
  return { action: 'shift', reason: 'behind schedule', metrics: metricsOf(progress), suggestion, newPlan, details, message };
}

function enrich({ nodes, goalPaths, plan, progress, today, generation, suggestion }) {
  // The lead beyond this week's own plan, so a student on pace is never told they are a week ahead.
  const hoursAhead = Math.floor(progress.leadHours);
  const outstanding = (progress.extras?.topics || []).filter((topic) => !topic.done).reduce((sum, topic) => sum + topic.hours, 0);
  const budget = hoursAhead - outstanding; // extras you have not done yet count against the time you have gained
  if (budget < MIN_EXTRA_HOURS) return none('enough extras already', progress, suggestion);

  const added = chooseExtras({ nodes, goalPaths, plan, progress, generation, budgetHours: budget });
  if (added.length === 0) return none('no optional topics available', progress, suggestion);

  const topics = [...(plan.extras?.topics || []), ...added];
  const newPlan = { ...plan, extras: buildExtras({ nodes, plan, topics, addedAt: today }) };
  const addedHours = added.reduce((sum, topic) => sum + topic.hours, 0);
  const ahead = round(progress.leadHours / plan.hoursPerWeek);
  const details = {
    oldEndDate: plan.endDate, newEndDate: plan.endDate, oldTotalWeeks: plan.totalWeeks, newTotalWeeks: plan.totalWeeks,
    addedNodeIds: [...new Set(added.map((topic) => topic.nodeId))], addedTopics: added.length, addedHours, hoursAhead
  };
  const message = `You were ${ahead} weeks ahead of schedule, so ${plural(added.length, 'optional topic')} (${addedHours} h) ${added.length === 1 ? 'was' : 'were'} added as extras. They are optional: they do not change your finish date, your pace or your percentage.`;
  return { action: 'enrich', reason: 'ahead of schedule', metrics: metricsOf(progress), suggestion, newPlan, details, message };
}
