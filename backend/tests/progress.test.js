import { describe, expect, it } from 'vitest';
import { readGraphFiles } from '../src/services/graphStore.js';
import { generateRoadmap } from '../src/engine/generateRoadmap.js';
import { computeProgress, reduceEvents } from '../src/engine/progress.js';

const { nodes, goalPaths } = readGraphFiles();
// A real Frontend roadmap for a beginner, week 1 = Mon 5 Jan 2026 (weeks run Monday to Sunday).
const plan = generateRoadmap({ nodes, goalPaths, goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10, startDate: '2026-01-05' });
const topicsOfWeek = (n) => [...new Set(plan.weeks[n - 1].topics.map((t) => t.topicId))];
const topicHours = (id) => plan.weeks.flatMap((w) => w.topics).filter((t) => t.topicId === id).reduce((s, t) => s + t.hours, 0);
const complete = (topicId, at) => ({ type: 'complete', topicId, at });
const at = (day) => new Date(`${day}T12:00:00Z`);
const progressAt = (day, events = [], overridePlan = plan) => computeProgress({ plan: overridePlan, events, now: at(day) });

describe('reduceEvents', () => {
  it('replays complete and uncomplete in time order', () => {
    const t = 'x';
    expect(reduceEvents([complete(t, at('2026-01-06')), { type: 'uncomplete', topicId: t, at: at('2026-01-07') }]).done.has(t)).toBe(false);
    expect(reduceEvents([{ type: 'uncomplete', topicId: t, at: at('2026-01-06') }, complete(t, at('2026-01-07'))]).done.has(t)).toBe(true);
    // input order does not matter, only the timestamps do
    expect(reduceEvents([complete(t, at('2026-01-07')), { type: 'uncomplete', topicId: t, at: at('2026-01-06') }]).done.has(t)).toBe(true);
  });

  it('adds up logged minutes per topic and ignores unknown event types', () => {
    const { minutes, done } = reduceEvents([{ type: 'time_logged', topicId: 'a', minutes: 30, at: at('2026-01-06') }, { type: 'time_logged', topicId: 'a', minutes: 45, at: at('2026-01-07') }, { type: 'mystery', topicId: 'b', at: at('2026-01-07') }]);
    expect(minutes.get('a')).toBe(75);
    expect(done.size).toBe(0);
  });
});

describe('progress against the plan', () => {
  it('before the start date nothing is behind', () => {
    const p = progressAt('2026-01-01');
    expect(p.pace).toBe('not_started');
    expect(p.percentComplete).toBe(0);
    expect(p.weeksEnded).toBe(0);
    expect(p.velocity).toBeNull();
    expect(p.lagWeeks).toBeNull();
    expect(p.currentWeek).toBe(1);
    expect(Object.values(p.topicStatus).every((s) => s === 'upcoming')).toBe(true);
  });

  it('during week 1 its topics are current and the rest upcoming', () => {
    const p = progressAt('2026-01-07');
    for (const id of topicsOfWeek(1)) expect(p.topicStatus[id]).toBe('current');
    expect(p.topicStatus[topicsOfWeek(3)[0]]).toBe('upcoming');
    expect(p.currentWeek).toBe(1);
  });

  it('measures velocity and lag from the hours planned in ended weeks', () => {
    const p = progressAt('2026-01-12'); // week 1 has just ended, nothing done
    expect(p.weeksEnded).toBe(1);
    expect(p.velocity).toBe(0);
    expect(p.lagWeeks).toBe(plan.weeks[0].plannedHours / 10);
    expect(p.pace).toBe('on_track'); // one week behind is not yet a problem
    const spillsOver = new Set(plan.weeks[1].topics.map((t) => t.topicId));
    for (const id of topicsOfWeek(1)) expect(p.topicStatus[id], id).toBe(spillsOver.has(id) ? 'current' : 'overdue'); // a topic continuing into week 2 is still in progress
    expect(topicsOfWeek(1).some((id) => !spillsOver.has(id))).toBe(true);
  });

  it('is behind when two or more weeks of planned work are missing', () => {
    const p = progressAt('2026-01-26'); // weeks 1-3 ended, nothing done
    expect(p.weeksEnded).toBe(3);
    expect(p.lagWeeks).toBeGreaterThanOrEqual(2);
    expect(p.pace).toBe('behind');
  });

  it('is on track when the planned work is done', () => {
    const events = [1, 2, 3].flatMap((w) => topicsOfWeek(w)).map((id) => complete(id, at('2026-01-20')));
    const p = progressAt('2026-01-26', events);
    expect(p.velocity).toBe(1);
    expect(p.lagWeeks).toBe(0);
    expect(p.pace).toBe('on_track');
  });

  it('is ahead when more is done than planned so far', () => {
    const events = [1, 2, 3, 4].flatMap((w) => topicsOfWeek(w)).map((id) => complete(id, at('2026-01-10')));
    const p = progressAt('2026-01-12'); // placeholder to read week sizes
    const ahead = progressAt('2026-01-12', events);
    expect(ahead.lagWeeks).toBeLessThanOrEqual(-1);
    expect(ahead.pace).toBe('ahead');
    expect(ahead.velocity).toBeGreaterThan(1);
    expect(p.pace).not.toBe('ahead');
  });

  it('computes the percentage by hours and the weekly completion rate', () => {
    const id = topicsOfWeek(1)[0];
    const p = progressAt('2026-01-07', [complete(id, at('2026-01-06'))]);
    expect(p.percentComplete).toBe(Math.round((100 * topicHours(id)) / plan.totalHours));
    expect(p.weekly[0].completedHours).toBe(topicHours(id));
    expect(p.weekly[0].completionRate).toBeCloseTo(topicHours(id) / plan.weeks[0].plannedHours, 2);
    expect(p.weekly[1].completionRate).toBe(0);
    expect(p.nodes[plan.weeks[0].topics[0].nodeId].done).toBe(1);
  });

  it('attributes logged minutes to the calendar week they happened in', () => {
    const id = topicsOfWeek(2)[0];
    const events = [
      { type: 'time_logged', topicId: id, minutes: 60, at: at('2026-01-13') },
      { type: 'time_logged', topicId: id, minutes: 30, at: at('2026-01-01') }, // before the plan: counted in week 1
      { type: 'time_logged', topicId: id, minutes: 15, at: at('2027-06-01') } // long after: counted in the last week
    ];
    const p = progressAt('2026-01-14', events);
    expect(p.weekly[1].minutesLogged).toBe(60);
    expect(p.weekly[0].minutesLogged).toBe(30);
    expect(p.weekly[plan.weeks.length - 1].minutesLogged).toBe(15);
    expect(p.loggedHours).toBe(1.75);
    expect(p.plannedHoursToDate).toBe(plan.weeks[0].plannedHours + plan.weeks[1].plannedHours);
  });

  it('counts work carried over from an earlier roadmap version', () => {
    const carried = { ...plan, completedTopics: [{ topicId: 'old-1', nodeId: 'n', title: 'Old', hours: 10 }] };
    const p = progressAt('2026-01-07', [], carried);
    expect(p.carriedHours).toBe(10);
    expect(p.doneHours).toBe(10);
    expect(p.percentComplete).toBe(Math.round((100 * 10) / (10 + plan.totalHours)));
  });

  it('ignores events for topics that are not in the plan', () => {
    const p = progressAt('2026-01-07', [complete('not-in-plan', at('2026-01-06')), { type: 'time_logged', topicId: 'not-in-plan', minutes: 500, at: at('2026-01-06') }]);
    expect(p.topicsDone).toBe(0);
    expect(p.loggedHours).toBe(0);
  });

  it('reports a finished roadmap', () => {
    const everything = [...new Set(plan.weeks.flatMap((w) => w.topics.map((t) => t.topicId)))].map((id) => complete(id, at('2026-01-06')));
    const p = progressAt('2026-02-01', everything);
    expect(p.percentComplete).toBe(100);
    expect(p.pace).toBe('complete');
    expect(p.nextUp).toEqual([]);
    expect(Object.values(p.nodes).every((n) => n.complete)).toBe(true);
  });

  it('lists what to do next, overdue first by plan order', () => {
    const p = progressAt('2026-01-12');
    expect(p.nextUp.length).toBe(6);
    expect(p.nextUp[0].overdue).toBe(true);
    expect(p.nextUp[0].week).toBe(1);
    expect([...p.nextUp].sort((a, b) => a.week - b.week)).toEqual(p.nextUp);
  });

  it('is deterministic for the same inputs', () => {
    const events = [complete(topicsOfWeek(1)[0], at('2026-01-06'))];
    expect(progressAt('2026-01-20', events)).toEqual(progressAt('2026-01-20', events));
  });
});

describe('regenerating with finished topics', () => {
  const finished = topicsOfWeek(1);
  const regenerated = generateRoadmap({ nodes, goalPaths, goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10, startDate: '2026-02-02', completedTopicIds: finished });

  it('never schedules finished topics again and reports them as completed', () => {
    const scheduled = new Set(regenerated.weeks.flatMap((w) => w.topics.map((t) => t.topicId)));
    for (const id of finished) expect(scheduled.has(id)).toBe(false);
    expect(regenerated.completedTopics.map((t) => t.topicId).sort()).toEqual([...finished].sort());
    expect(regenerated.completedHours).toBe(regenerated.completedTopics.reduce((s, t) => s + t.hours, 0));
  });

  it('keeps total effort consistent: remaining + completed equals the original plan', () => {
    expect(regenerated.totalHours + regenerated.completedHours).toBe(plan.totalHours);
    expect(regenerated.hoursSaved).toBe(plan.hoursSaved);
  });

  it('marks a skill with every topic finished as done and keeps it in the tree', () => {
    const first = plan.nodes[0];
    const all = generateRoadmap({ nodes, goalPaths, goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10, startDate: '2026-02-02', completedTopicIds: first.topics.map((t) => t.id) });
    const node = all.nodes.find((n) => n.id === first.id);
    expect(node.status).toBe('done');
    expect(node.estimatedHours).toBe(0);
    expect(node.topics.every((t) => t.done)).toBe(true);
    expect(all.edges.some((e) => e.from === first.id)).toBe(true);
    expect(all.weeks.flatMap((w) => w.topics).every((t) => t.nodeId !== first.id)).toBe(true);
  });

  it('a roadmap with everything finished has no weeks left', () => {
    const everything = [...new Set(plan.weeks.flatMap((w) => w.topics.map((t) => t.topicId)))];
    const done = generateRoadmap({ nodes, goalPaths, goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10, startDate: '2026-02-02', completedTopicIds: everything });
    expect(done.totalWeeks).toBe(0);
    expect(done.nodes.every((n) => n.status === 'done' || n.status === 'mastered')).toBe(true);
    expect(computeProgress({ plan: done, events: [], now: at('2026-02-03') }).percentComplete).toBe(100);
  });
});
