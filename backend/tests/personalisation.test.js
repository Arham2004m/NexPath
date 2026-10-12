import { describe, expect, it } from 'vitest';
import { readGraphFiles } from '../src/services/graphStore.js';
import { allGoalPaths } from '../src/engine/graph.js';
import { planMastery } from '../src/engine/mastery.js';
import { generateRoadmap, weeklyTopicCap } from '../src/engine/generateRoadmap.js';

const { nodes, goalPaths } = readGraphFiles();
const base = { nodes, goalPaths, hoursPerWeek: 10, startDate: '2026-01-05' };
const DOMAINS = ['prog', 'dsa', 'os', 'dbms', 'web', 'aiml', 'cn', 'sd', 'mobile'];

// A tested domain result for `points` out of 6 (easy 1 + medium 2 + hard 3), as the real assessment produces.
const entry = (points) => {
  const normalized = Number((points / 6).toFixed(2));
  return { label: 'x', band: normalized < 0.4 ? 'Beginner' : normalized < 0.75 ? 'Intermediate' : 'Advanced', normalized, assessmentMethod: 'tested' };
};
const everywhere = (points) => Object.fromEntries(DOMAINS.map((d) => [d, entry(points)]));

const roadmapFor = (goalId, subTrack, profile, results = {}, selfKnown = [], hoursPerWeek = 10) => {
  const plan = planMastery({ nodes, goalPaths, goalId, subTrack, profile, results, selfKnown });
  return generateRoadmap({ ...base, hoursPerWeek, goalId, subTrack, mastered: plan.mastered, credits: plan.credits, trims: plan.trims, sources: plan.sources });
};
const fingerprint = (r) => JSON.stringify([r.nodes.map((n) => [n.id, n.status, n.creditedTopics]), r.weeks.map((w) => w.topics.map((t) => `${t.topicId}:${t.hours}`))]);

describe('hours per week really change the plan', () => {
  const goals = [['web_dev', 'fullstack'], ['faang', null], ['gate', null], ['ms_abroad', null], ['entrepreneur', null], ['ai_ml', null]];

  it('totalWeeks strictly decreases as hoursPerWeek increases', () => {
    for (const [goalId, subTrack] of goals) {
      let previous = Infinity;
      for (const hoursPerWeek of [3, 5, 8, 12, 18, 25, 40]) {
        const { totalWeeks } = generateRoadmap({ ...base, goalId, subTrack, hoursPerWeek });
        expect(totalWeeks, `${goalId}/${subTrack} at ${hoursPerWeek} h`).toBeLessThan(previous);
        previous = totalWeeks;
      }
    }
  });

  it('never gets longer with more hours, for every goal and sub-track', () => {
    for (const { goalId, subTrack } of allGoalPaths(goalPaths)) {
      let previous = Infinity;
      for (let hoursPerWeek = 3; hoursPerWeek <= 40; hoursPerWeek++) {
        const { totalWeeks } = generateRoadmap({ ...base, goalId, subTrack, hoursPerWeek });
        expect(totalWeeks, `${goalId}/${subTrack} at ${hoursPerWeek} h`).toBeLessThanOrEqual(previous);
        previous = totalWeeks;
      }
    }
  });

  it('stays close to total hours divided by weekly hours (no hidden ceiling)', () => {
    for (const [goalId, subTrack] of goals) {
      for (const hoursPerWeek of [3, 10, 20, 40]) {
        const roadmap = generateRoadmap({ ...base, goalId, subTrack, hoursPerWeek });
        const ideal = Math.ceil(roadmap.totalHours / hoursPerWeek);
        expect(roadmap.totalWeeks, `${goalId}/${subTrack} at ${hoursPerWeek} h`).toBeLessThanOrEqual(ideal + Math.max(2, Math.ceil(ideal * 0.1)));
      }
    }
  });

  it('actually uses a heavy week: the busiest week reaches close to the chosen hours', () => {
    const roadmap = generateRoadmap({ ...base, goalId: 'faang', hoursPerWeek: 40 });
    expect(Math.max(...roadmap.weeks.map((w) => w.plannedHours))).toBeGreaterThanOrEqual(36);
  });

  it('the weekly topic cap grows only above 15 hours', () => {
    expect([3, 8, 15].map(weeklyTopicCap)).toEqual([3, 3, 3]);
    expect([20, 40].map(weeklyTopicCap)).toEqual([4, 8]);
  });
});

describe('capstones: no empty roadmaps', () => {
  it('every path declares a capstone that is one of its required skills', () => {
    for (const { goalId, subTrack, path } of allGoalPaths(goalPaths)) {
      expect(path.capstone, `${goalId}/${subTrack}`).toBeTruthy();
      expect(path.required).toContain(path.capstone);
    }
  });

  it('a student who is Advanced everywhere still gets a roadmap for every goal and sub-track', () => {
    for (const { goalId, subTrack, path } of allGoalPaths(goalPaths)) {
      const roadmap = roadmapFor(goalId, subTrack, everywhere(6));
      expect(roadmap.totalWeeks, `${goalId}/${subTrack}`).toBeGreaterThan(0);
      expect(roadmap.nodes.find((n) => n.id === path.capstone).status).not.toBe('mastered');
    }
  });

  it('the old empty-roadmap cases (web Advanced for Frontend, mobile Advanced for Flutter) now have content', () => {
    expect(roadmapFor('web_dev', 'frontend', { web: entry(6) }).totalWeeks).toBeGreaterThan(0);
    expect(roadmapFor('web_dev', 'backend', { web: entry(6), dbms: entry(6) }).totalWeeks).toBeGreaterThan(0);
    expect(roadmapFor('mobile_dev', 'flutter', { mobile: entry(6) }).totalWeeks).toBeGreaterThan(0);
  });

  it('self-reports cannot skip a capstone either', () => {
    const plan = planMastery({ nodes, goalPaths, goalId: 'web_dev', subTrack: 'frontend', profile: {}, selfKnown: ['web-portfolio', 'web-react'] });
    expect(plan.mastered).toContain('web-react');
    expect(plan.mastered).not.toContain('web-portfolio');
  });
});

describe('different scores give different roadmaps', () => {
  it('every score from 0 to 4 in the main domain produces a different Frontend roadmap', () => {
    const seen = new Map();
    for (let points = 0; points <= 4; points++) {
      const key = fingerprint(roadmapFor('web_dev', 'frontend', { web: entry(points) }));
      expect(seen.has(key), `web ${points}/6 matches ${seen.get(key)}/6`).toBe(false);
      seen.set(key, points);
    }
  });

  it('students in the same band with different scores no longer get the same roadmap', () => {
    expect(new Set([0, 1, 2].map((p) => fingerprint(roadmapFor('faang', null, { dsa: entry(p) })))).size).toBe(3);
    expect(new Set([3, 4].map((p) => fingerprint(roadmapFor('faang', null, { dsa: entry(p) })))).size).toBe(2);
  });

  it('more points never means more to learn', () => {
    for (const [goalId, subTrack, domain] of [['web_dev', 'frontend', 'web'], ['faang', null, 'dsa'], ['ai_ml', null, 'aiml'], ['gate', null, 'os']]) {
      let previous = Infinity;
      for (let points = 0; points <= 6; points++) {
        const { totalHours } = roadmapFor(goalId, subTrack, { [domain]: entry(points) });
        expect(totalHours, `${goalId} ${domain} ${points}/6`).toBeLessThanOrEqual(previous);
        previous = totalHours;
      }
    }
  });

  it('a domain that is not part of the goal does not change the roadmap', () => {
    expect(fingerprint(roadmapFor('web_dev', 'frontend', { aiml: entry(6), dsa: entry(5) }))).toBe(fingerprint(roadmapFor('web_dev', 'frontend', {})));
  });

  it('partial credit never skips the last topic of a skill, a capstone or level-3 skills', () => {
    for (const { goalId, subTrack, path } of allGoalPaths(goalPaths)) {
      for (let points = 1; points <= 6; points++) {
        const plan = planMastery({ nodes, goalPaths, goalId, subTrack, profile: everywhere(points) });
        for (const [id, credited] of Object.entries(plan.credits)) {
          const node = nodes.find((n) => n.id === id);
          expect(credited, `${goalId}/${subTrack} ${id}`).toBeLessThan(node.topics.length);
          expect(node.level).toBeLessThanOrEqual(2);
          expect(id).not.toBe(path.capstone);
        }
      }
    }
  });

  it('credited topics are removed from the plan and the saved hours are reported', () => {
    const full = roadmapFor('web_dev', 'frontend', {});
    const partial = roadmapFor('web_dev', 'frontend', { web: entry(2) });
    const node = partial.nodes.find((n) => n.creditedTopics > 0);
    expect(node).toBeTruthy();
    expect(node.skippedHours).toBeGreaterThan(0);
    expect(node.estimatedHours).toBe(node.fullHours - node.skippedHours);
    expect(node.topics.filter((t) => t.credited).length).toBe(node.creditedTopics);
    expect(partial.totalHours).toBeLessThan(full.totalHours);
    const scheduled = new Set(partial.weeks.flatMap((w) => w.topics.map((t) => t.topicId)));
    for (const topic of node.topics.filter((t) => t.credited)) expect(scheduled.has(topic.id)).toBe(false);
  });

  it('credits skills whose own question was answered right, never skills whose question was answered wrong', () => {
    const profile = { web: entry(2) };
    const right = planMastery({ nodes, goalPaths, goalId: 'web_dev', subTrack: 'frontend', profile, results: { web: [{ id: 'web-m1', nodeId: 'web-js', correct: true }, { id: 'web-e1', nodeId: 'web-html-css', correct: false }] } });
    expect(right.credits['web-js']).toBeGreaterThan(0);
    expect(right.credits['web-html-css']).toBeUndefined();
    const flipped = planMastery({ nodes, goalPaths, goalId: 'web_dev', subTrack: 'frontend', profile, results: { web: [{ id: 'web-m1', nodeId: 'web-js', correct: false }, { id: 'web-e1', nodeId: 'web-html-css', correct: true }] } });
    expect(flipped.credits['web-html-css']).toBeGreaterThan(0);
    expect(flipped.credits['web-js']).toBeUndefined();
  });

  it('is deterministic', () => {
    const profile = { web: entry(4), prog: entry(2) };
    expect(fingerprint(roadmapFor('web_dev', 'fullstack', profile))).toBe(fingerprint(roadmapFor('web_dev', 'fullstack', profile)));
  });
});

describe('self-reported skills', () => {
  it('skips a skill the student says they know and records why', () => {
    const plain = planMastery({ nodes, goalPaths, goalId: 'gate', profile: {} });
    const self = planMastery({ nodes, goalPaths, goalId: 'gate', profile: {}, selfKnown: ['toc', 'coa-basics'] });
    expect(plain.mastered).not.toContain('toc');
    expect(self.mastered).toEqual(expect.arrayContaining(['toc', 'coa-basics']));
    const roadmap = generateRoadmap({ ...base, goalId: 'gate', mastered: self.mastered, sources: self.sources });
    expect(roadmap.nodes.find((n) => n.id === 'toc').source).toBe('self');
    expect(roadmap.totalHours).toBeLessThan(generateRoadmap({ ...base, goalId: 'gate' }).totalHours);
  });

  it('ignores unknown skill ids', () => {
    expect(planMastery({ nodes, goalPaths, goalId: 'gate', profile: {}, selfKnown: ['made-up'] }).mastered).toEqual([]);
  });

  it('personalises areas the assessment never covers (unassessed domains)', () => {
    const a = planMastery({ nodes, goalPaths, goalId: 'ms_abroad', profile: {}, selfKnown: ['ms-gre'] });
    const b = planMastery({ nodes, goalPaths, goalId: 'ms_abroad', profile: {}, selfKnown: ['research-methods'] });
    expect(JSON.stringify(a.mastered)).not.toBe(JSON.stringify(b.mastered));
  });
});
