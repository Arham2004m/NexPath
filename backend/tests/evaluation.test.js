import { describe, expect, it } from 'vitest';
import { runEvaluation, summarise, toCsv, toMarkdown } from '../src/evaluation/evaluate.js';
import { simulate } from './helpers/simulate.js';

describe('evaluation harness', () => {
  it('the fixed-plan baseline never changes the plan, and the default stays adaptive', () => {
    const fixed = simulate({ goalId: 'faang', learner: 'slow', days: 300, adaptive: false });
    expect(fixed.replans).toEqual([]);
    expect(fixed.plans).toHaveLength(1);
    expect(new Set(fixed.forecasts.map((f) => f.endDate)).size).toBe(1); // always the same promise
    const adaptive = simulate({ goalId: 'faang', learner: 'slow', days: 300 });
    expect(adaptive.replans.length).toBeGreaterThan(0);
    expect(new Set(adaptive.forecasts.map((f) => f.endDate)).size).toBeGreaterThan(1);
  });

  it('is deterministic and shows the adaptive plan staying closer to reality for students who fall behind', () => {
    const options = { goals: [{ goalId: 'ai_ml', subTrack: null, label: 'AI / ML' }], hours: [10], learners: ['steady', 'slow', 'vanishes'], days: 600 };
    const rows = runEvaluation(options);
    expect(runEvaluation(options)).toEqual(rows);
    const pick = (learner, plan) => rows.find((r) => r.learner === learner && r.plan === plan);
    for (const learner of ['slow', 'vanishes']) {
      expect(pick(learner, 'adaptive').forecastErrorDays, learner).toBeLessThan(pick(learner, 'fixed').forecastErrorDays);
      expect(pick(learner, 'adaptive').meanWeeksBehind, learner).toBeLessThan(pick(learner, 'fixed').meanWeeksBehind);
    }
    // a student who keeps up is not disturbed
    expect(pick('steady', 'adaptive')).toEqual({ ...pick('steady', 'fixed'), plan: 'adaptive' });
    expect(pick('steady', 'adaptive').replans).toBe(0);
  });

  it('summarises and exports without losing a row', () => {
    const rows = runEvaluation({ goals: [{ goalId: 'gate', subTrack: null, label: 'GATE preparation' }], hours: [10], learners: ['slow'], days: 600 });
    const summary = summarise(rows);
    expect(summary.map((s) => s.learner)).toEqual(['slow', 'ALL']);
    expect(summary[0].runs).toBe(1);
    expect(toCsv(rows).trim().split('\n')).toHaveLength(rows.length + 1);
    expect(toMarkdown(summary, 1)).toContain('| slow | 1 |');
  });
});
