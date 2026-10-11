import { describe, expect, it } from 'vitest';
import { readGraphFiles } from '../src/services/graphStore.js';
import { computeGraphVersion, findCycle, validateGraph } from '../src/engine/graph.js';
import { masteredNodeIds } from '../src/engine/mastery.js';
import { generateRoadmap, RoadmapError } from '../src/engine/generateRoadmap.js';
import { recommendGoals } from '../src/engine/goalRecommender.js';

const { nodes, goalPaths } = readGraphFiles();
const base = { nodes, goalPaths, hoursPerWeek: 10, startDate: '2026-01-05' };
const tested = (band, normalized) => ({ band, normalized, assessmentMethod: 'tested' });

describe('knowledge graph', () => {
  it('is valid and has no cycles', () => {
    const { errors } = validateGraph(nodes, goalPaths);
    expect(errors).toEqual([]);
    expect(findCycle(nodes)).toBeNull();
  });

  it('detects cycles and prints the loop', () => {
    const broken = [
      { id: 'a', level: 1, prerequisites: ['b'], estimatedHours: 3, topics: [{ id: 'a1', hours: 3 }], miniTasks: ['x'], resources: [1, 2, 3] },
      { id: 'b', level: 1, prerequisites: ['a'], estimatedHours: 3, topics: [{ id: 'b1', hours: 3 }], miniTasks: ['x'], resources: [1, 2, 3] }
    ];
    expect(findCycle(broken)).toEqual(['a', 'b', 'a']);
    expect(validateGraph(broken, {}).errors.join('\n')).toMatch(/cycle: a -> b -> a/);
  });

  it('reports dangling prerequisites, hour mismatches and unknown goal nodes', () => {
    const bad = [{ id: 'a', level: 1, prerequisites: ['ghost'], estimatedHours: 9, topics: [{ id: 'a1', hours: 3 }], miniTasks: ['x'], resources: [1, 2, 3] }];
    const text = validateGraph(bad, { g: { required: ['nope'] } }).errors.join('\n');
    expect(text).toMatch(/unknown prerequisite "ghost"/);
    expect(text).toMatch(/add up to 3 but estimatedHours is 9/);
    expect(text).toMatch(/Goal g: unknown node "nope"/);
  });

  it('versions the graph by content', () => {
    const version = computeGraphVersion(nodes, goalPaths);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(computeGraphVersion([...nodes].reverse(), goalPaths)).toBe(version);
    expect(computeGraphVersion(nodes.slice(1), goalPaths)).not.toBe(version);
  });
});

describe('mastery mapping', () => {
  it('skips level 1 for Intermediate and levels 1-2 for Advanced, never level 3', () => {
    const intermediate = masteredNodeIds(nodes, { dsa: tested('Intermediate', 0.5) });
    const advanced = masteredNodeIds(nodes, { dsa: tested('Advanced', 0.9) });
    expect(intermediate).toContain('dsa-arrays');
    expect(intermediate).not.toContain('dsa-trees');
    expect(advanced).toContain('dsa-graphs');
    expect(advanced).not.toContain('dsa-dp');
  });

  it('ignores self-reported domains and Beginner results', () => {
    expect(masteredNodeIds(nodes, { dsa: { band: 'Advanced', assessmentMethod: 'self-reported' }, web: tested('Beginner', 0.1) })).toEqual([]);
  });

  it('credits mobile stack nodes only for the matching sub-track', () => {
    const profile = { mobile: tested('Advanced', 0.9) };
    expect(masteredNodeIds(nodes, profile, 'flutter')).toContain('mobile-dart');
    expect(masteredNodeIds(nodes, profile, 'flutter')).not.toContain('mobile-kotlin');
    expect(masteredNodeIds(nodes, profile, null)).toEqual([]);
  });
});

describe('generateRoadmap', () => {
  const frontend = { ...base, goalId: 'web_dev', subTrack: 'frontend' };

  it('orders every prerequisite before the skills that need it, for every goal and sub-track', () => {
    const cases = [['faang', null], ['ai_ml', null], ['web_dev', 'frontend'], ['web_dev', 'backend'], ['web_dev', 'fullstack'], ['mobile_dev', 'android'], ['mobile_dev', 'flutter'], ['mobile_dev', 'ios']];
    for (const [goalId, subTrack] of cases) {
      const roadmap = generateRoadmap({ ...base, goalId, subTrack });
      const planned = roadmap.nodes.filter((n) => n.status !== 'mastered');
      const endWeek = new Map(planned.map((n) => [n.id, n.endWeek]));
      const order = planned.map((n) => n.id);
      for (const node of planned) {
        for (const prerequisite of node.prerequisites) {
          if (!endWeek.has(prerequisite)) continue;
          expect(order.indexOf(prerequisite), `${goalId}/${subTrack}: ${prerequisite} before ${node.id}`).toBeLessThan(order.indexOf(node.id));
          expect(endWeek.get(prerequisite)).toBeLessThanOrEqual(node.startWeek);
        }
      }
    }
  });

  it('is deterministic', () => {
    expect(generateRoadmap(frontend)).toEqual(generateRoadmap(frontend));
  });

  it('gives different roadmaps for different starting levels', () => {
    const beginner = generateRoadmap(frontend);
    const advanced = generateRoadmap({ ...frontend, mastered: masteredNodeIds(nodes, { web: tested('Advanced', 0.9) }) });
    expect(advanced.totalHours).toBeLessThan(beginner.totalHours);
    expect(advanced.hoursSaved).toBeGreaterThan(0);
    expect(advanced.nodes.some((n) => n.status === 'mastered')).toBe(true);
    expect(advanced.nodes.map((n) => n.id)).not.toEqual(beginner.nodes.map((n) => n.id));
  });

  it('does not descend below mastered skills', () => {
    const custom = { ...base, goalPaths: { g: { required: ['web-state-ts'] } }, goalId: 'g', mastered: ['web-react'] };
    const roadmap = generateRoadmap(custom);
    const ids = roadmap.nodes.map((n) => n.id);
    expect(ids).toEqual(['web-react', 'web-state-ts']);
    expect(roadmap.nodes.find((n) => n.id === 'web-react').status).toBe('mastered');
    expect(generateRoadmap({ ...custom, mastered: [] }).nodes.map((n) => n.id)).toContain('web-js');
  });

  it('respects weekly capacity and the topics-per-week cap', () => {
    for (const hoursPerWeek of [4, 10, 25]) {
      const roadmap = generateRoadmap({ ...frontend, hoursPerWeek });
      for (const week of roadmap.weeks) {
        expect(week.plannedHours).toBeLessThanOrEqual(hoursPerWeek);
        expect(new Set(week.topics.map((t) => t.topicId)).size).toBeLessThanOrEqual(3);
        expect(week.miniTask.text).toBeTruthy();
      }
    }
  });

  it('spreads a topic longer than a week across weeks and conserves total hours', () => {
    const roadmap = generateRoadmap({ ...frontend, hoursPerWeek: 4 });
    expect(roadmap.weeks.some((w) => w.topics.some((t) => t.continued))).toBe(true);
    expect(roadmap.weeks.reduce((sum, w) => sum + w.plannedHours, 0)).toBe(roadmap.totalHours);
  });

  it('takes more weeks at fewer hours per week', () => {
    expect(generateRoadmap({ ...frontend, hoursPerWeek: 5 }).totalWeeks).toBeGreaterThan(generateRoadmap({ ...frontend, hoursPerWeek: 20 }).totalWeeks);
  });

  it('flags an infeasible deadline with the hours per week that would work', () => {
    const roadmap = generateRoadmap({ ...frontend, targetWeeks: 4 });
    expect(roadmap.feasible).toBe(false);
    expect(roadmap.requiredHoursPerWeek).toBe(Math.ceil(roadmap.totalHours / 4));
    expect(generateRoadmap({ ...frontend, targetWeeks: 200 }).feasible).toBe(true);
  });

  it('dates weeks from the start date', () => {
    const roadmap = generateRoadmap(frontend);
    expect(roadmap.weeks[0].startDate).toBe('2026-01-05');
    expect(roadmap.weeks[1].startDate).toBe('2026-01-12');
  });

  it('attaches resources to every week', () => {
    expect(generateRoadmap(frontend).weeks.every((w) => w.resources.length > 0)).toBe(true);
  });

  it('rejects goals without a defined path and invalid hours', () => {
    expect(() => generateRoadmap({ ...base, goalId: 'gate' })).toThrow(RoadmapError);
    expect(() => generateRoadmap({ ...frontend, hoursPerWeek: 0 })).toThrow(/hoursPerWeek/);
  });

  it('schedules every topic of every planned skill', () => {
    const roadmap = generateRoadmap({ ...base, goalId: 'faang' });
    const scheduled = new Set(roadmap.weeks.flatMap((w) => w.topics).map((t) => t.topicId));
    const expected = roadmap.nodes.filter((n) => n.status !== 'mastered').flatMap((n) => n.topics.map((t) => t.id));
    expect(scheduled.size).toBe(expected.length);
  });
});

describe('goal recommender', () => {
  const domains = ['prog', 'dsa', 'os', 'dbms', 'web', 'aiml', 'cn', 'sd', 'mobile'];
  const profileOf = (levels, fallback = 0.2) => Object.fromEntries(domains.map((d) => {
    const value = levels[d] ?? fallback;
    return [d, { label: d, ...tested(value >= 0.75 ? 'Advanced' : value >= 0.4 ? 'Intermediate' : 'Beginner', value) }];
  }));
  const top = (levels) => recommendGoals(profileOf(levels))[0].goalId;

  it('recommends the goal that matches the strongest area', () => {
    expect(top({ web: 0.9, prog: 0.7, dbms: 0.6 })).toBe('web_dev');
    expect(top({ aiml: 0.9, prog: 0.8, dsa: 0.5 })).toBe('ai_ml');
    expect(top({ dsa: 0.9, prog: 0.8, sd: 0.5, os: 0.5 })).toBe('faang');
    expect(top({ mobile: 0.9, prog: 0.7 })).toBe('mobile_dev');
    expect(top({ os: 0.8, dbms: 0.8, cn: 0.8, dsa: 0.6, prog: 0.6 })).toBe('gate');
  });

  it('points beginners at realistic starting goals', () => {
    const ranked = recommendGoals(profileOf({}, 0.1));
    expect(['campus_placement', 'web_dev']).toContain(ranked[0].goalId);
    expect(ranked[0].match).toBe('Good place to start');
  });

  it('is deterministic and explains itself', () => {
    const profile = profileOf({ web: 0.9, prog: 0.7 });
    expect(recommendGoals(profile)).toEqual(recommendGoals(profile));
    expect(recommendGoals(profile)[0].reasons.length).toBeGreaterThan(0);
  });
});
