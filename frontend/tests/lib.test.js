import { describe, expect, it, vi } from 'vitest';
import { hoursLabel, minutesLabel, paceSummary, topicIndex, withTopicDone } from '../src/lib/progress';
import { effortLabel, weeksFor } from '../src/lib/format';
import { createSerialQueue } from '../src/lib/serialQueue';
import { layoutRoadmap, NODE_HEIGHT, NODE_WIDTH } from '../src/lib/roadmapLayout';
import { summarizeAttempt } from '../src/lib/assessmentSummary';
import { catalog, makePlan, makeProgress } from './fixtures';

describe('withTopicDone (instant feedback before the server answers)', () => {
  const plan = makePlan();

  it('ticking a topic raises hours, percentage and the skills progress', () => {
    const next = withTopicDone(makeProgress(), 't1', true, plan);
    expect(next.topicStatus.t1).toBe('done');
    expect(next.topicsDone).toBe(1);
    expect(next.doneHours).toBe(4);
    expect(next.percentComplete).toBe(33);
    expect(next.nodes.n1).toEqual({ done: 1, total: 2, complete: false });
  });

  it('completes a skill when its last topic is ticked', () => {
    const half = withTopicDone(makeProgress(), 't1', true, plan);
    expect(withTopicDone(half, 't2', true, plan).nodes.n1.complete).toBe(true);
  });

  it('unticking reverses it', () => {
    const ticked = withTopicDone(makeProgress(), 't1', true, plan);
    const undone = withTopicDone(ticked, 't1', false, plan);
    expect(undone.topicsDone).toBe(0);
    expect(undone.doneHours).toBe(0);
    expect(undone.percentComplete).toBe(0);
    expect(undone.nodes.n1.complete).toBe(false);
  });

  it('does nothing when the topic is already in that state', () => {
    const progress = makeProgress();
    expect(withTopicDone(progress, 't1', false, plan)).toBe(progress);
    const done = withTopicDone(progress, 't1', true, plan);
    expect(withTopicDone(done, 't1', true, plan)).toBe(done);
  });

  it('never shows 100% until every topic is done', () => {
    let progress = makeProgress({ doneHours: 11, totalHours: 12, topicsDone: 2, topicStatus: { t1: 'done', t2: 'done', t3: 'upcoming' } });
    progress = withTopicDone(progress, 't3', true, plan);
    expect(progress.percentComplete).toBe(100);
    const almost = withTopicDone(makeProgress({ doneHours: 0, totalHours: 4.1 }), 't1', true, makePlan());
    expect(almost.percentComplete).toBeLessThanOrEqual(99);
  });

  it('ticking an optional extra changes only the extras, never the percentage or the topic counts', () => {
    const extra = { topicId: 'x1', nodeId: 'xn', nodeName: 'Extra skill', title: 'Extra topic', hours: 6, index: 0 };
    const withExtras = makePlan({ extras: { topics: [extra], nodes: [] } });
    const progress = makeProgress({ percentComplete: 25, topicStatus: { ...makeProgress().topicStatus, x1: 'optional' }, nodes: { ...makeProgress().nodes, xn: { done: 0, total: 1, complete: false } }, extras: { total: 1, done: 0, hours: 6, doneHours: 0, topics: [{ ...extra, done: false, minutes: 0 }], nodes: { xn: { done: 0, total: 1, complete: false } } } });
    const ticked = withTopicDone(progress, 'x1', true, withExtras);
    expect(ticked.topicStatus.x1).toBe('done');
    expect(ticked.extras).toMatchObject({ done: 1, doneHours: 6 });
    expect(ticked.nodes.xn.complete).toBe(true);
    expect(ticked.percentComplete).toBe(25);
    expect(ticked.topicsDone).toBe(progress.topicsDone);
    expect(ticked.doneHours).toBe(progress.doneHours);
    const undone = withTopicDone(ticked, 'x1', false, withExtras);
    expect(undone.topicStatus.x1).toBe('optional');
    expect(undone.extras.done).toBe(0);
  });

  it('survives an unknown topic and missing progress', () => {
    expect(withTopicDone(null, 't1', true, plan)).toBeNull();
    expect(withTopicDone(makeProgress(), 'ghost', true, plan).topicStatus.ghost).toBe('done');
  });

  it('adds up a topic that spans several weeks', () => {
    const spanning = makePlan({ weeks: [{ index: 1, topics: [{ topicId: 'x', nodeId: 'n1', hours: 3 }] }, { index: 2, topics: [{ topicId: 'x', nodeId: 'n1', hours: 4 }] }] });
    expect(topicIndex(spanning).get('x')).toEqual({ nodeId: 'n1', hours: 7 });
  });
});

describe('plain-language labels', () => {
  it('describes every pace without alarming wording', () => {
    for (const pace of ['complete', 'not_started', 'behind', 'ahead', 'on_track']) {
      const text = paceSummary(makeProgress({ pace, lagWeeks: pace === 'behind' ? 2.4 : pace === 'ahead' ? -1.5 : 0.5, leadHours: 15 }));
      expect(text.label, pace).toBeTruthy();
      expect(text.detail, pace).toBeTruthy();
    }
    expect(paceSummary(makeProgress({ pace: 'behind', lagWeeks: 2.4 })).detail).toContain('2.4');
    expect(paceSummary(makeProgress({ pace: 'ahead', lagWeeks: -1.5, leadHours: 15 })).detail).toContain('15 h');
  });

  it('formats time', () => {
    expect(minutesLabel(0)).toBe('0 min');
    expect(minutesLabel(45)).toBe('45 min');
    expect(minutesLabel(60)).toBe('1 h');
    expect(minutesLabel(135)).toBe('2 h 15 min');
    expect(hoursLabel(4)).toBe('4 h');
    expect(hoursLabel(1.5)).toBe('1.5 h');
  });
});

describe('goal estimates', () => {
  const web = catalog.goals.find((g) => g.id === 'web_dev');
  const faang = catalog.goals.find((g) => g.id === 'faang');

  it('gives the real weeks at the chosen hours for every goal', () => {
    expect(weeksFor(faang, 3)).toBe('77');
    expect(weeksFor(faang, 40)).toBe('7');
    expect(weeksFor(web, 20, 'fullstack')).toBe('14');
  });

  it('gives a range for Web before a sub-track is chosen', () => {
    expect(weeksFor(web, 10, null)).toBe('11–26');
    expect(weeksFor(web, 40, null)).toBe('3–7');
  });

  it('more hours always means fewer weeks in the table', () => {
    for (const goal of catalog.goals) {
      for (const entity of goal.subTracks || [goal]) {
        const hours = Object.keys(entity.weeksByHours).map(Number).sort((a, b) => a - b);
        const weeks = hours.map((h) => entity.weeksByHours[h]);
        expect([...weeks].sort((a, b) => b - a), entity.label || goal.label).toEqual(weeks);
      }
    }
  });

  it('returns nothing for unknown hours or goals and labels cards honestly', () => {
    expect(weeksFor(faang, 99)).toBeNull();
    expect(weeksFor(null, 10)).toBeNull();
    expect(effortLabel(faang)).toBe('≈ 229 h · about 24 weeks at 10 h/week');
    expect(effortLabel(web)).toBe('≈ 100–250 h depending on track');
    expect(effortLabel({ estimatedHours: null })).toBeNull();
  });
});

describe('serial queue', () => {
  it('runs jobs in order even when an earlier one is slower', async () => {
    const queue = createSerialQueue();
    const order = [];
    const slow = queue.run(() => new Promise((resolve) => setTimeout(() => { order.push('slow'); resolve('a'); }, 30)));
    const fast = queue.run(async () => { order.push('fast'); return 'b'; });
    const [first, second] = await Promise.all([slow, fast]);
    expect(order).toEqual(['slow', 'fast']);
    expect(first.idle).toBe(false);
    expect(second.idle).toBe(true);
    expect(second.value).toBe('b');
  });

  it('reports a failure without stopping later jobs', async () => {
    const queue = createSerialQueue();
    const failed = queue.run(async () => { throw new Error('boom'); });
    const after = queue.run(async () => 'still runs');
    expect((await failed).error.message).toBe('boom');
    expect((await after).value).toBe('still runs');
  });
});

describe('skill tree layout', () => {
  const nodes = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }, { id: 'd', order: 3 }, { id: 'e', order: 4 }];
  const edges = [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'c', to: 'e' }];

  it('puts every skill below the skills it builds on, without overlaps', () => {
    const pos = layoutRoadmap(nodes, edges);
    for (const { from, to } of edges) expect(pos[to].y).toBeGreaterThan(pos[from].y);
    const ids = Object.keys(pos);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const overlap = Math.abs(pos[ids[i]].x - pos[ids[j]].x) < NODE_WIDTH && Math.abs(pos[ids[i]].y - pos[ids[j]].y) < NODE_HEIGHT;
      expect(overlap, `${ids[i]} / ${ids[j]}`).toBe(false);
    }
  });

  it('handles a single skill and a chain', () => {
    expect(Object.keys(layoutRoadmap([{ id: 'x', order: 0 }], []))).toEqual(['x']);
    const chain = layoutRoadmap([{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]);
    expect(chain.a.y).toBeLessThan(chain.b.y);
    expect(chain.b.y).toBeLessThan(chain.c.y);
  });
});

describe('assessment summary', () => {
  it('counts self-reported domains as no evidence', () => {
    const attempt = { profile: { web: { assessmentMethod: 'tested', normalized: 0.9, label: 'Web' }, os: { assessmentMethod: 'self-reported', label: 'OS' } } };
    expect(summarizeAttempt(attempt)).toEqual({ level: 'Intermediate', strongest: 'Web' });
    expect(summarizeAttempt({ profile: {} })).toBeNull();
    expect(summarizeAttempt(null)).toBeNull();
  });
});

describe('unused vi import guard', () => {
  it('keeps vitest helpers available', () => { expect(typeof vi.fn).toBe('function'); });
});
