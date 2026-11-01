// A day-by-day simulation of a student following (and being replanned by) NexPath, using only the pure engine.
// Used by the tests to check long-run behaviour and by `npm run evaluate` (src/evaluation/evaluate.js) for the paper.
import { readGraphFiles } from '../services/graphStore.js';
import { generateRoadmap } from '../engine/generateRoadmap.js';
import { planMastery } from '../engine/mastery.js';
import { completedTopicIdsFrom, computeProgress } from '../engine/progress.js';
import { REPLAN_COOLDOWN_DAYS, replan } from '../engine/replan.js';

const { nodes, goalPaths } = readGraphFiles();
const START = '2026-01-05';
export const dayOf = (offset) => new Date(Date.parse(`${START}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

// How many hours the student really works on each day, as a fraction of the weekly hours they planned.
export const LEARNERS = {
  fast: () => 1.4,
  steady: () => 1.0,
  slow: () => 0.5,
  // two good weeks, then a week off, repeating
  inconsistent: (day) => ([1.2, 1.2, 0][Math.floor(day / 7) % 3]),
  // a busy period: nothing for four weeks starting in week 3
  vanishes: (day) => (day >= 14 && day < 42 ? 0 : 1.0)
};

export function simulate({ goalId = 'ai_ml', subTrack = null, hoursPerWeek = 10, targetWeeks = null, profile = {}, learner = 'steady', days = 400, acceptSuggestions = false, adaptive = true }) {
  const mastery = planMastery({ nodes, goalPaths, goalId, subTrack, profile });
  let hours = hoursPerWeek;
  const build = (completedTopicIds, startDate, target) => generateRoadmap({
    nodes, goalPaths, goalId, subTrack, hoursPerWeek: hours, targetWeeks: target, startDate, graphVersion: 'sim', completedTopicIds, ...mastery
  });

  let plan = build([], START, targetWeeks);
  const first = plan;
  const events = [];
  // `forecasts`: the finish date the student was being told, sampled weekly; `lagSamples`: weeks behind (0 when not behind), weekly.
  const log = { replans: [], plans: [plan], accepted: [], completedDay: null, firstTopics: first.totalHours, forecasts: [], lagSamples: [] };
  let lastReplanDay = -Infinity;
  let carry = 0; // hours worked but not yet enough to finish the next topic

  for (let day = 0; day <= days; day++) {
    const today = dayOf(day);
    // The student's real capacity is fixed by their life, not by what the plan says (it is based on the hours they first planned).
    const work = (LEARNERS[learner](day) * hoursPerWeek) / 7;
    carry += work;

    // The student works on the earliest unfinished topic of their current plan, extras last.
    const done = new Set(completedTopicIdsFrom(events));
    const queue = [...new Set(plan.weeks.flatMap((week) => week.topics.map((topic) => topic.topicId)))].filter((id) => !done.has(id));
    const size = (id) => plan.weeks.flatMap((week) => week.topics).filter((topic) => topic.topicId === id).reduce((sum, topic) => sum + topic.hours, 0);
    while (queue.length && carry >= size(queue[0]) - 1e-9) {
      carry -= size(queue[0]);
      events.push({ type: 'complete', topicId: queue.shift(), at: new Date(`${today}T12:00:00Z`), day: today });
    }
    if (queue.length === 0 && log.completedDay === null) log.completedDay = day;
    if (queue.length === 0) carry = 0;

    const progress = computeProgress({ plan, events, today });
    if (day % 7 === 0 && log.completedDay === null) { log.forecasts.push({ day, endDate: plan.endDate }); log.lagSamples.push(Math.max(0, progress.lagWeeks ?? 0)); }
    if (!adaptive) continue; // the fixed-plan baseline: the plan is never changed after it is first generated
    const decision = replan({
      nodes, goalPaths, plan, progress, today, generation: { graphVersion: 'sim', ...mastery },
      completedTopicIds: completedTopicIdsFrom(events), cooldownActive: day - lastReplanDay < REPLAN_COOLDOWN_DAYS
    });
    if (acceptSuggestions && decision.suggestion && decision.suggestion.hoursPerWeek < hours) {
      // The student accepts the offer: weekly hours drop and the roadmap is rebuilt from today, keeping finished work.
      hours = decision.suggestion.hoursPerWeek;
      log.accepted.push({ day, hoursPerWeek: hours });
      plan = build(completedTopicIdsFrom(events), today, null);
      log.plans.push(plan);
      continue;
    }
    if (decision.action !== 'none') {
      log.replans.push({ day, action: decision.action, oldEndDate: decision.details.oldEndDate, newEndDate: decision.details.newEndDate, metrics: decision.metrics, topicsBefore: queue.length });
      plan = decision.newPlan;
      lastReplanDay = day;
      log.plans.push(plan);
    }
  }
  return { ...log, events, finalPlan: plan, hoursPerWeek: hours, nodes, goalPaths };
}
