import { describe, expect, it } from 'vitest';
import { readGraphFiles } from '../src/services/graphStore.js';
import { generateRoadmap } from '../src/engine/generateRoadmap.js';
import { planMastery } from '../src/engine/mastery.js';
import { computeProgress } from '../src/engine/progress.js';
import { LOW_VELOCITY_WEEKS, lowVelocitySuggestion, replan } from '../src/engine/replan.js';

const { nodes, goalPaths } = readGraphFiles();
const START = '2026-01-05'; // a Monday: weeks end on Sundays 11 Jan, 18 Jan, 25 Jan...
const day = (offset) => new Date(Date.parse(`${START}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const at = (date) => new Date(`${date}T12:00:00Z`);
const complete = (topicId, date) => ({ type: 'complete', topicId, at: at(date), day: date });

// A real roadmap plus everything the replanner needs to rebuild it.
function setup({ goalId = 'ai_ml', subTrack = null, hoursPerWeek = 10, targetWeeks = null, profile = {} } = {}) {
  const mastery = planMastery({ nodes, goalPaths, goalId, subTrack, profile });
  const generation = { graphVersion: 'test', ...mastery };
  const plan = generateRoadmap({ nodes, goalPaths, goalId, subTrack, hoursPerWeek, targetWeeks, startDate: START, graphVersion: 'test', ...mastery });
  const topicIds = (week) => [...new Set(plan.weeks[week - 1].topics.map((t) => t.topicId))];
  const allTopicIds = plan.weeks.flatMap((w) => w.topics.map((t) => t.topicId)).filter((id, i, all) => all.indexOf(id) === i);
  const decide = (events, today, extra = {}) => {
    const progress = computeProgress({ plan, events, today });
    const completedTopicIds = events.filter((e) => e.type === 'complete').map((e) => e.topicId);
    return { progress, result: replan({ nodes, goalPaths, plan, progress, today, generation, completedTopicIds, ...extra }) };
  };
  return { plan, generation, topicIds, allTopicIds, decide };
}

// Real progress for a plan, with the pace numbers overwritten, to test the exact thresholds.
const withLag = (progress, lagWeeks, hoursPerWeek = 10) => {
  const planned = 40;
  const completed = planned - lagWeeks * hoursPerWeek;
  return { ...progress, lagWeeks, weeksEnded: Math.max(1, progress.weeksEnded), endedPlannedHours: planned, completedPlanHours: completed, pace: lagWeeks >= 2 ? 'behind' : lagWeeks <= -1 ? 'ahead' : 'on_track' };
};

describe('thresholds from the spec', () => {
  const { plan, generation, decide } = setup();
  const base = decide([], day(0)).progress;
  const run = (lagWeeks) => replan({ nodes, goalPaths, plan, progress: withLag(base, lagWeeks), today: day(21), generation, completedTopicIds: [] });

  it('does nothing while less than two weeks behind', () => {
    for (const lag of [1.99, 1.5, 1, 0.5, 0, -0.5, -0.99]) expect(run(lag).action, `lag ${lag}`).toBe('none');
  });

  it('shifts at exactly two weeks behind and beyond', () => {
    for (const lag of [2, 2.01, 3.5, 8]) expect(run(lag).action, `lag ${lag}`).toBe('shift');
  });

  it('adds extras at exactly one week ahead and beyond (when something qualifies)', () => {
    const { plan: p, generation: g, allTopicIds } = setup();
    const events = allTopicIds.slice(0, 12).map((id) => complete(id, day(1)));
    const progress = computeProgress({ plan: p, events, today: day(8) });
    expect(progress.lagWeeks).toBeLessThanOrEqual(-1);
    expect(replan({ nodes, goalPaths, plan: p, progress, today: day(8), generation: g, completedTopicIds: events.map((e) => e.topicId) }).action).toBe('enrich');
  });

  it('does nothing before the first week has ended', () => {
    const { result } = decide([], day(3));
    expect(result.action).toBe('none');
    expect(result.reason).toBe('first week not over');
  });
});

describe('being on pace is not being ahead', () => {
  it('a student who finishes exactly this weeks planned work is on track, not ahead', () => {
    const { plan, topicIds, decide } = setup();
    // End of week 2 (the day before week 3 starts, so week 2 still counts as current): weeks 1 and 2 completely done.
    const events = [...topicIds(1), ...topicIds(2)].map((id) => complete(id, day(10)));
    const { progress, result } = decide(events, day(13));
    expect(progress.pace).toBe('on_track');
    expect(result.action).toBe('none');
    expect(plan.weeks[1].endDate).toBe(day(13));
  });

  it('being a whole week beyond everything planned so far is what counts as ahead', () => {
    const { topicIds, decide } = setup();
    const events = [...topicIds(1), ...topicIds(2), ...topicIds(3)].map((id) => complete(id, day(10)));
    const { progress, result } = decide(events, day(13));
    expect(progress.leadHours).toBeGreaterThanOrEqual(10);
    expect(progress.pace).toBe('ahead');
    expect(result.action).toBe('enrich');
  });

  it('the extras are sized by the lead beyond the current week, not by this weeks own work', () => {
    const { topicIds, decide } = setup();
    const events = [...topicIds(1), ...topicIds(2), ...topicIds(3), ...topicIds(4)].map((id) => complete(id, day(10)));
    const { progress, result } = decide(events, day(13));
    expect(result.details.hoursAhead).toBe(Math.floor(progress.leadHours));
    expect(result.details.addedHours).toBeLessThanOrEqual(result.details.hoursAhead);
  });
});

describe('falling behind: shift', () => {
  it('reschedules every unfinished topic from today and moves the end date forward', () => {
    const { plan, decide } = setup();
    const { result } = decide([], day(21)); // three weeks in, nothing done
    expect(result.action).toBe('shift');
    expect(result.newPlan.startDate).toBe(day(21));
    expect(result.newPlan.weeks[0].startDate).toBe(day(21));
    expect(result.newPlan.endDate > plan.endDate).toBe(true);
    expect(result.newPlan.totalHours).toBe(plan.totalHours);
    expect(result.details).toMatchObject({ oldEndDate: plan.endDate, newEndDate: result.newPlan.endDate, rescheduledHours: plan.totalHours });
    expect(result.metrics).toMatchObject({ pace: 'behind', weeksEnded: 3, completedHours: 0 });
    expect(result.message).toMatch(/behind schedule/);
  });

  it('never moves or removes finished work', () => {
    const { plan, topicIds, decide } = setup();
    const finished = topicIds(1);
    const { result } = decide(finished.map((id) => complete(id, day(2))), day(28));
    expect(result.action).toBe('shift');
    const scheduled = new Set(result.newPlan.weeks.flatMap((w) => w.topics.map((t) => t.topicId)));
    for (const id of finished) expect(scheduled.has(id), id).toBe(false);
    expect(result.newPlan.completedTopics.map((t) => t.topicId).sort()).toEqual([...finished].sort());
    // Nothing was lost or invented: what is left plus what is finished is the whole original plan.
    expect(result.newPlan.totalHours + result.newPlan.completedHours).toBe(plan.totalHours);
  });

  it('after a shift the new plan starts clean, so it cannot trigger again by itself', () => {
    const { plan, generation, decide } = setup();
    const { result } = decide([], day(21));
    const progress = computeProgress({ plan: result.newPlan, events: [], today: day(21) });
    expect(progress.pace).toBe('not_started');
    const again = replan({ nodes, goalPaths, plan: result.newPlan, progress, today: day(21), generation, completedTopicIds: [] });
    expect(again.action).toBe('none');
    expect(plan.startDate).toBe(START);
  });

  it('keeps the students deadline date and shrinks the weeks left to reach it', () => {
    const { plan, decide } = setup({ targetWeeks: 20 });
    expect(plan.deadlineDate).toBe(day(140));
    const { result } = decide([], day(21));
    expect(result.newPlan.deadlineDate).toBe(day(140));
    expect(result.newPlan.targetWeeks).toBe(Math.floor((140 - 21) / 7));
    expect(result.details.deadline).toMatchObject({ date: day(140), passed: false });
  });

  it('says what it would take to still make the deadline, or that it cannot be made', () => {
    const tight = setup({ targetWeeks: 6 });
    const { result } = tight.decide([], day(28));
    expect(result.details.deadline.feasible).toBe(false);
    expect(result.message).toMatch(/hours a week|no longer possible/);
  });

  it('drops the target when the deadline has passed instead of reporting nonsense', () => {
    const { decide } = setup({ targetWeeks: 4 });
    const { result } = decide([], day(60));
    expect(result.action).toBe('shift');
    expect(result.newPlan.targetWeeks).toBeNull();
    expect(result.newPlan.deadlineDate).toBeNull();
    expect(result.details.deadline.passed).toBe(true);
    expect(result.message).toMatch(/has passed/);
  });

  it('does nothing when everything is already done', () => {
    const { allTopicIds, decide } = setup();
    const { result, progress } = decide(allTopicIds.map((id) => complete(id, day(1))), day(60));
    expect(progress.pace).toBe('complete');
    expect(result.action).toBe('none');
    expect(result.reason).toBe('complete');
  });
});

describe('getting ahead: enrich', () => {
  const ahead = () => {
    const s = setup();
    const events = s.allTopicIds.slice(0, 14).map((id) => complete(id, day(1)));
    return { ...s, events, ...s.decide(events, day(8)) };
  };

  it('adds optional topics and leaves the schedule, finish date and percentage alone', () => {
    const { plan, progress, result } = ahead();
    expect(result.action).toBe('enrich');
    expect(result.newPlan.weeks).toEqual(plan.weeks);
    expect(result.newPlan.endDate).toBe(plan.endDate);
    expect(result.newPlan.totalHours).toBe(plan.totalHours);
    expect(result.details).toMatchObject({ oldEndDate: plan.endDate, newEndDate: plan.endDate });
    expect(result.newPlan.extras.topics.length).toBeGreaterThan(0);
    const after = computeProgress({ plan: result.newPlan, events: [], today: day(8) });
    expect(after.extras.total).toBe(result.newPlan.extras.topics.length);
    expect(computeProgress({ plan: result.newPlan, events: ahead().events, today: day(8) }).percentComplete).toBe(progress.percentComplete);
    expect(result.message).toMatch(/ahead of schedule/);
  });

  it('stays within the hours gained and only uses skills whose prerequisites are met', () => {
    const { plan, progress, result } = ahead();
    const budget = Math.floor(progress.completedPlanHours - progress.endedPlannedHours);
    const hours = result.newPlan.extras.topics.reduce((sum, t) => sum + t.hours, 0);
    expect(hours).toBeLessThanOrEqual(budget);
    expect(result.details.addedHours).toBe(hours);
    const path = goalPaths[plan.goalId];
    const met = (id) => { const n = plan.nodes.find((x) => x.id === id); return !!n && (n.status === 'mastered' || n.status === 'done' || progress.nodes[id]?.complete); };
    for (const node of result.newPlan.extras.nodes) {
      expect(path.optional, node.id).toContain(node.id);
      expect(node.prerequisites.every(met), node.id).toBe(true);
      expect(node.optional).toBe(true);
      expect(node.status).toBe('optional');
    }
  });

  it('never adds a topic that is already in the plan or already an extra, and never the same twice', () => {
    const { plan, result } = ahead();
    const planTopics = new Set(plan.weeks.flatMap((w) => w.topics.map((t) => t.topicId)));
    const ids = result.newPlan.extras.topics.map((t) => t.topicId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(planTopics.has(id), id).toBe(false);
  });

  it('extras you have not done yet count against the time gained, so they cannot pile up', () => {
    const { plan, generation, events, progress, result } = ahead();
    const completed = events.map((e) => e.topicId);
    const second = replan({ nodes, goalPaths, plan: result.newPlan, progress: computeProgress({ plan: result.newPlan, events, today: day(8) }), today: day(8), generation, completedTopicIds: completed });
    // The first batch used the whole budget, so a second look finds nothing new to add.
    expect(second.action).toBe('none');
    expect(['enough extras already', 'no optional topics available']).toContain(second.reason);
    expect(plan.extras).toBeUndefined();
    expect(progress.extras.total).toBe(0);
  });

  it('adds nothing when no optional skill has its prerequisites met', () => {
    const s = setup({ goalId: 'faang' });
    // Far ahead, but only on skills that unlock no optional skill (os, networks, databases and system design are untouched).
    const topicsOf = (ids) => s.plan.nodes.filter((n) => ids.includes(n.id)).flatMap((n) => n.topics.map((t) => t.id));
    const events = topicsOf(['prog-basics', 'dsa-arrays', 'dsa-linear', 'dsa-sorting-search']).map((id) => complete(id, day(1)));
    const { result, progress } = s.decide(events, day(8));
    expect(progress.lagWeeks).toBeLessThanOrEqual(-4);
    expect(result).toMatchObject({ action: 'none', reason: 'no optional topics available', newPlan: null });
  });

  it('unlocks an optional skill only once its prerequisite skill is completely finished', () => {
    const s = setup({ goalId: 'faang' });
    const topicsOf = (ids) => s.plan.nodes.filter((n) => ids.includes(n.id)).flatMap((n) => n.topics.map((t) => t.id));
    const base = topicsOf(['prog-basics', 'dsa-arrays', 'dsa-linear', 'dsa-sorting-search']);
    const osTopics = topicsOf(['os-basics']);
    const partial = s.decide([...base, ...osTopics.slice(0, -1)].map((id) => complete(id, day(1))), day(8));
    expect(partial.result.action).toBe('none'); // one topic of os-basics still open
    const full = s.decide([...base, ...osTopics].map((id) => complete(id, day(1))), day(8));
    expect(full.result.action).toBe('enrich');
    expect(full.result.newPlan.extras.nodes.map((n) => n.id)).toContain('os-concurrency');
  });

  it('does not enrich in the 7 days after another replan', () => {
    const { decide, events } = ahead();
    expect(decide(events, day(8), { cooldownActive: true }).result).toMatchObject({ action: 'none', reason: 'cooldown' });
  });
});

describe('extras respect what the student already knows', () => {
  const entry = (points) => { const n = Number((points / 6).toFixed(2)); return { label: 'x', band: n < 0.4 ? 'Beginner' : n < 0.75 ? 'Intermediate' : 'Advanced', normalized: n, assessmentMethod: 'tested' }; };
  // ai_ml lists dbms-sql, sd-basics and web-node as optional extras.
  const aheadWith = (profile, selfKnown = []) => {
    const mastery = planMastery({ nodes, goalPaths, goalId: 'ai_ml', profile, selfKnown });
    const generation = { graphVersion: 'test', ...mastery };
    const plan = generateRoadmap({ nodes, goalPaths, goalId: 'ai_ml', hoursPerWeek: 10, startDate: START, graphVersion: 'test', ...mastery });
    const ids = plan.weeks.flatMap((w) => w.topics.map((t) => t.topicId)).filter((id, i, all) => all.indexOf(id) === i);
    const events = ids.slice(0, 20).map((id) => complete(id, day(1)));
    const progress = computeProgress({ plan, events, today: day(8) });
    return replan({ nodes, goalPaths, plan, progress, today: day(8), generation, completedTopicIds: events.map((e) => e.topicId) });
  };
  const extraIds = (result) => (result.newPlan?.extras?.nodes || []).map((n) => n.id);

  it('offers an optional skill the student does not know', () => {
    expect(extraIds(aheadWith({}))).toContain('dbms-sql');
  });

  it('never offers an optional skill that the assessment already skipped', () => {
    const result = aheadWith({ dbms: entry(6) }); // Advanced databases: dbms-sql is known
    expect(extraIds(result)).not.toContain('dbms-sql');
  });

  it('never offers one the student marked as known', () => {
    expect(extraIds(aheadWith({}, ['dbms-sql']))).not.toContain('dbms-sql');
  });

  it('unlocks an optional skill whose prerequisites were known from the start, even though they are not on the path', () => {
    // sd-basics needs databases, operating systems and networks; an Advanced student has all three without them being on the ai_ml path.
    const result = aheadWith({ dbms: entry(6), os: entry(6), cn: entry(6) });
    expect(extraIds(result)).toContain('sd-basics');
  });

  it('does not unlock it while a prerequisite is still unknown', () => {
    expect(extraIds(aheadWith({ dbms: entry(6), os: entry(6) }))).not.toContain('sd-basics');
  });

  it('skips topics the student has already been credited for', () => {
    const credited = aheadWith({ dbms: entry(2) }); // a partial score credits the first topics of the next level
    const topicsOfDbms = (credited.newPlan?.extras?.topics || []).filter((t) => t.nodeId === 'dbms-sql');
    const creditedCount = planMastery({ nodes, goalPaths, goalId: 'ai_ml', profile: { dbms: entry(2) } }).credits['dbms-sql'] || 0;
    for (const topic of topicsOfDbms) expect(topic.index).toBeGreaterThanOrEqual(creditedCount);
  });
});

describe('suggesting fewer hours', () => {
  it('needs three finished weeks in a row below 60%', () => {
    const { plan, topicIds, decide } = setup();
    expect(decide([], day(14)).result.suggestion).toBeNull(); // only two weeks have ended
    const slow = decide([], day(21)).result.suggestion; // three weeks, nothing done
    expect(slow).toMatchObject({ currentHoursPerWeek: 10, weeks: LOW_VELOCITY_WEEKS });
    expect(slow.hoursPerWeek).toBeLessThan(10);
    expect(slow.hoursPerWeek).toBeGreaterThanOrEqual(3);
    // One good week among the last three removes the suggestion.
    const events = topicIds(2).map((id) => complete(id, day(10)));
    expect(decide(events, day(21)).result.suggestion).toBeNull();
    expect(plan.hoursPerWeek).toBe(10);
  });

  it('suggests the pace that is really being kept, never below 3 and never above the current load', () => {
    const progress = (completed) => ({ weekly: [1, 2, 3].map((index) => ({ index, state: 'ended', plannedHours: 10, completedHours: completed, completionRate: completed / 10 })) });
    expect(lowVelocitySuggestion(progress(4), 10)).toMatchObject({ hoursPerWeek: 4, averageCompletedHours: 4 });
    expect(lowVelocitySuggestion(progress(5.5), 10).hoursPerWeek).toBe(6);
    expect(lowVelocitySuggestion(progress(0), 10).hoursPerWeek).toBe(5); // no activity: offer half, not the minimum
    expect(lowVelocitySuggestion(progress(0), 4).hoursPerWeek).toBe(3);
    expect(lowVelocitySuggestion(progress(0), 3)).toBeNull(); // nothing lower to offer
    expect(lowVelocitySuggestion(progress(6), 10)).toBeNull(); // 60% is not below 60%
    expect(lowVelocitySuggestion({ weekly: [] }, 10)).toBeNull();
  });

  it('is a suggestion only: the replanner never changes the weekly hours', () => {
    const { plan, decide } = setup();
    const { result } = decide([], day(21));
    expect(result.suggestion).toBeTruthy();
    expect(result.newPlan.hoursPerWeek).toBe(plan.hoursPerWeek);
  });

  it('is still offered while a replan is cooling down', () => {
    const { decide } = setup();
    const { result } = decide([], day(21), { cooldownActive: true });
    expect(result.action).toBe('none');
    expect(result.suggestion).toBeTruthy();
  });
});

describe('guards and determinism', () => {
  it('is deterministic', () => {
    const { decide } = setup();
    expect(decide([], day(21)).result).toEqual(decide([], day(21)).result);
  });

  it('does not touch its inputs', () => {
    const { plan, generation } = setup();
    const progress = computeProgress({ plan, events: [], today: day(21) });
    const before = JSON.stringify({ plan, progress, generation });
    replan({ nodes, goalPaths, plan, progress, today: day(21), generation, completedTopicIds: [] });
    expect(JSON.stringify({ plan, progress, generation })).toBe(before);
  });

  it('one automatic replan per week: the cooldown blocks a shift too', () => {
    const { decide } = setup();
    expect(decide([], day(21), { cooldownActive: true }).result).toMatchObject({ action: 'none', reason: 'cooldown' });
  });
});

// Whatever the student does, a replan may never lose finished work, invent hours or break the schedule.
describe('safety properties (random students)', () => {
  let seed = 20260101;
  const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const goals = [['ai_ml', null], ['web_dev', 'frontend'], ['web_dev', 'fullstack'], ['faang', null], ['gate', null], ['mobile_dev', 'flutter'], ['campus_placement', null], ['entrepreneur', null]];

  it('holds for 400 random students across every kind of goal', () => {
    const seen = { shift: 0, enrich: 0, none: 0 };
    for (let run = 0; run < 400; run++) {
      const [goalId, subTrack] = goals[Math.floor(random() * goals.length)];
      const hoursPerWeek = [3, 5, 8, 10, 15, 20, 30][Math.floor(random() * 7)];
      const s = setup({ goalId, subTrack, hoursPerWeek, targetWeeks: random() < 0.4 ? 5 + Math.floor(random() * 40) : null });
      const events = [];
      for (const id of s.allTopicIds) if (random() < [0.05, 0.3, 0.6, 0.95][Math.floor(random() * 4)]) events.push(complete(id, day(Math.floor(random() * 30))));
      const today = day(7 + Math.floor(random() * 90));
      const { progress, result } = s.decide(events, today, { cooldownActive: random() < 0.15 });
      const finished = new Set(events.map((e) => e.topicId));
      seen[result.action] += 1;

      expect(['none', 'shift', 'enrich']).toContain(result.action);
      expect(result.metrics.pace).toBe(progress.pace);
      if (result.action === 'none') { expect(result.newPlan).toBeNull(); continue; }

      const label = `${goalId}/${subTrack} ${hoursPerWeek}h run ${run}`;
      const scheduled = result.newPlan.weeks.flatMap((w) => w.topics.map((t) => t.topicId));
      if (result.action === 'shift') {
        for (const week of result.newPlan.weeks) expect(week.plannedHours, label).toBeLessThanOrEqual(hoursPerWeek);
        for (const id of scheduled) expect(finished.has(id), `${label}: ${id} was finished`).toBe(false);
        expect(result.newPlan.startDate, label).toBe(today);
        const unfinishedBefore = s.allTopicIds.filter((id) => !finished.has(id));
        expect(new Set(scheduled), label).toEqual(new Set(unfinishedBefore));
        expect(result.newPlan.totalHours + result.newPlan.completedHours, label).toBe(s.plan.totalHours);
        expect(progress.lagWeeks, label).toBeGreaterThanOrEqual(2);
      } else {
        expect(result.newPlan.weeks, label).toEqual(s.plan.weeks);
        expect(result.newPlan.endDate, label).toBe(s.plan.endDate);
        const planTopics = new Set(s.allTopicIds);
        for (const topic of result.newPlan.extras.topics) expect(planTopics.has(topic.topicId), label).toBe(false);
        expect(result.details.addedHours, label).toBeLessThanOrEqual(Math.floor(progress.completedPlanHours - progress.endedPlannedHours));
        expect(progress.lagWeeks, label).toBeLessThanOrEqual(-1);
      }
    }
    expect(seen.shift).toBeGreaterThan(20);
    expect(seen.enrich).toBeGreaterThan(5);
    expect(seen.none).toBeGreaterThan(20);
  });
});
