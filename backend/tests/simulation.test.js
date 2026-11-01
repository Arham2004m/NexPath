import { describe, expect, it } from 'vitest';
import { LEARNERS, simulate } from './helpers/simulate.js';

const topicIds = (plan) => plan.weeks.flatMap((week) => week.topics.map((topic) => topic.topicId));

describe('long-run behaviour over months', () => {
  const runs = Object.keys(LEARNERS).flatMap((learner) => [['ai_ml', null], ['web_dev', 'frontend'], ['faang', null]].map(([goalId, subTrack]) => ({ learner, goalId, subTrack })));

  it('every kind of student, every kind of goal: the guarantees hold for the whole timeline', () => {
    for (const { learner, goalId, subTrack } of runs) {
      const sim = simulate({ goalId, subTrack, learner, days: 400 });
      const label = `${learner} / ${goalId}${subTrack ? `/${subTrack}` : ''}`;

      // at most one automatic replan per 7 days
      for (let i = 1; i < sim.replans.length; i++) expect(sim.replans[i].day - sim.replans[i - 1].day, `${label}: replans on days ${sim.replans[i - 1].day} and ${sim.replans[i].day}`).toBeGreaterThanOrEqual(7);

      // finished work is never scheduled again, and never finished twice
      const finishedIds = sim.events.map((event) => event.topicId);
      expect(new Set(finishedIds).size, `${label}: a topic was completed twice`).toBe(finishedIds.length);
      const finishedBefore = new Set();
      for (const plan of sim.plans) {
        for (const id of topicIds(plan)) expect(finishedBefore.has(id), `${label}: ${id} was rescheduled after being finished`).toBe(false);
        for (const done of plan.completedTopics || []) finishedBefore.add(done.topicId);
      }

      // effort is conserved: what is left plus what is finished is always the original plan
      for (const plan of sim.plans.filter((p) => !p.extras)) expect(plan.totalHours + plan.completedHours, `${label}: effort changed`).toBeCloseTo(sim.plans[0].totalHours, 5);

      // a shift never promises an earlier finish than the plan it replaced
      for (const replan of sim.replans.filter((r) => r.action === 'shift')) expect(replan.newEndDate >= replan.oldEndDate, `${label}: shift moved the end date backwards`).toBe(true);

      // extras never alter the schedule
      for (const replan of sim.replans.filter((r) => r.action === 'enrich')) expect(replan.newEndDate).toBe(replan.oldEndDate);
    }
  });

  it('a student who keeps up never gets replanned and finishes on time', () => {
    for (const [goalId, subTrack] of [['ai_ml', null], ['web_dev', 'frontend'], ['faang', null], ['gate', null]]) {
      expect(simulate({ goalId, subTrack, learner: 'steady', days: 500 }).replans, goalId).toEqual([]);
    }
    const sim = simulate({ learner: 'steady', days: 400 });
    expect(sim.replans).toEqual([]); // no rescheduling, and no "you are ahead" extras for someone exactly on pace
    expect(sim.completedDay).not.toBeNull();
    expect(sim.completedDay).toBeLessThanOrEqual(sim.plans[0].totalWeeks * 7 + 7);
  });

  it('a fast student gets optional extras and finishes early', () => {
    const sim = simulate({ goalId: 'faang', learner: 'fast', days: 400 });
    expect(sim.replans.some((r) => r.action === 'enrich')).toBe(true);
    expect(sim.completedDay).toBeLessThan(sim.plans[0].totalWeeks * 7);
  });

  it('a slow student is rescheduled, gets the offer to lower their hours, and still finishes', () => {
    const sim = simulate({ learner: 'slow', days: 700 });
    expect(sim.replans.some((r) => r.action === 'shift')).toBe(true);
    expect(sim.replans.some((r) => r.action === 'shift' && r.metrics.pace === 'behind')).toBe(true);
    expect(sim.completedDay).not.toBeNull();
  });

  it('accepting the offer to lower hours stops the repeated rescheduling', () => {
    const stubborn = simulate({ learner: 'slow', days: 700 });
    const accepting = simulate({ learner: 'slow', days: 700, acceptSuggestions: true });
    expect(accepting.accepted.length).toBeGreaterThan(0);
    expect(accepting.hoursPerWeek).toBeLessThan(10);
    expect(accepting.replans.filter((r) => r.action === 'shift').length).toBeLessThan(stubborn.replans.filter((r) => r.action === 'shift').length);
  });

  it('a student who vanishes for a month is replanned the day they come back, with nothing lost', () => {
    const sim = simulate({ learner: 'vanishes', days: 400 });
    const shifts = sim.replans.filter((r) => r.action === 'shift');
    expect(shifts.length).toBeGreaterThan(0);
    expect(shifts[0].day).toBeGreaterThanOrEqual(21); // not before they could be two weeks behind
    expect(sim.completedDay).not.toBeNull();
  });

  it('an intermittent student is not replanned every time they take a week off', () => {
    const sim = simulate({ learner: 'inconsistent', days: 400 });
    const shifts = sim.replans.filter((r) => r.action === 'shift');
    expect(shifts.length).toBeLessThan(sim.plans[0].totalWeeks / 2);
  });

  it('is repeatable: the same student always gets the same replans', () => {
    const a = simulate({ learner: 'inconsistent', days: 300 });
    const b = simulate({ learner: 'inconsistent', days: 300 });
    expect(a.replans).toEqual(b.replans);
  });
});
