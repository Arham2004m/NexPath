// Evaluation for the paper: the same simulated students follow (a) a fixed plan that is never changed and (b) NexPath's
// adaptive plan, and we compare how truthful the schedule stays.
//   npm run evaluate            prints the tables and writes evaluation/results.csv and evaluation/results.md
//
// Metrics (per student, lower is better for all three):
//   forecast error  how many days off the finish date shown to the student was, averaged over every week until they finished
//   weeks behind    the average, over the same weeks, of how far behind the plan they were (0 when on pace)
//   overdue peak    the largest number of weeks behind at any point
// Learners are deterministic work patterns (see LEARNERS in simulate.js), so every run gives identical numbers.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dayOf, LEARNERS, simulate } from './simulate.js';

export const GOALS = [
  { goalId: 'faang', subTrack: null, label: 'Product company placement' },
  { goalId: 'campus_placement', subTrack: null, label: 'Campus placements' },
  { goalId: 'web_dev', subTrack: 'fullstack', label: 'Web developer (full stack)' },
  { goalId: 'ai_ml', subTrack: null, label: 'AI / ML' },
  { goalId: 'gate', subTrack: null, label: 'GATE preparation' }
];
export const HOURS = [8, 15];
const HORIZON_DAYS = 700;

const DAY_MS = 86_400_000;
const daysBetween = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
const mean = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
const round = (value, places = 1) => (value === null ? null : Number(value.toFixed(places)));

export function measure(sim) {
  const finishDate = sim.completedDay === null ? null : dayOf(sim.completedDay);
  return {
    finished: finishDate !== null,
    finishDay: sim.completedDay,
    forecastErrorDays: finishDate ? round(mean(sim.forecasts.map((f) => Math.abs(daysBetween(f.endDate, finishDate))))) : null,
    meanWeeksBehind: round(mean(sim.lagSamples), 2),
    peakWeeksBehind: round(Math.max(0, ...sim.lagSamples), 1),
    replans: sim.replans.filter((r) => r.action === 'shift').length,
    extrasOffers: sim.replans.filter((r) => r.action === 'enrich').length
  };
}

export function runEvaluation({ goals = GOALS, hours = HOURS, learners = Object.keys(LEARNERS), days = HORIZON_DAYS } = {}) {
  const rows = [];
  for (const goal of goals) {
    for (const hoursPerWeek of hours) {
      for (const learner of learners) {
        for (const adaptive of [false, true]) {
          const sim = simulate({ goalId: goal.goalId, subTrack: goal.subTrack, hoursPerWeek, learner, days, adaptive });
          rows.push({ goal: goal.label, hoursPerWeek, learner, plan: adaptive ? 'adaptive' : 'fixed', ...measure(sim) });
        }
      }
    }
  }
  return rows;
}

// Mean of a metric over the rows that have it.
const avg = (rows, key) => round(mean(rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined)));

export function summarise(rows) {
  const pairs = [];
  for (const row of rows.filter((r) => r.plan === 'fixed')) {
    const other = rows.find((r) => r.plan === 'adaptive' && r.goal === row.goal && r.hoursPerWeek === row.hoursPerWeek && r.learner === row.learner);
    pairs.push({ learner: row.learner, fixed: row, adaptive: other });
  }
  const learners = [...new Set(pairs.map((p) => p.learner))];
  const line = (label, chosen) => ({
    learner: label, runs: chosen.length,
    fixedError: avg(chosen.map((p) => p.fixed), 'forecastErrorDays'), adaptiveError: avg(chosen.map((p) => p.adaptive), 'forecastErrorDays'),
    fixedBehind: avg(chosen.map((p) => p.fixed), 'meanWeeksBehind'), adaptiveBehind: avg(chosen.map((p) => p.adaptive), 'meanWeeksBehind'),
    fixedPeak: avg(chosen.map((p) => p.fixed), 'peakWeeksBehind'), adaptivePeak: avg(chosen.map((p) => p.adaptive), 'peakWeeksBehind'),
    replans: avg(chosen.map((p) => p.adaptive), 'replans')
  });
  return [...learners.map((learner) => line(learner, pairs.filter((p) => p.learner === learner))), line('ALL', pairs)];
}

export const toCsv = (rows) => {
  const columns = Object.keys(rows[0]);
  return `${columns.join(',')}\n${rows.map((row) => columns.map((c) => (row[c] === null ? '' : String(row[c]).includes(',') ? `"${row[c]}"` : row[c])).join(',')).join('\n')}\n`;
};

export function toMarkdown(summary, runs) {
  const f = (v) => (v === null ? 'n/a' : v);
  const head = '| Student pattern | Runs | Forecast error, fixed (days) | Forecast error, adaptive (days) | Weeks behind, fixed | Weeks behind, adaptive | Peak behind, fixed | Peak behind, adaptive | Replans |\n|---|---|---|---|---|---|---|---|---|';
  const body = summary.map((s) => `| ${s.learner} | ${s.runs} | ${f(s.fixedError)} | ${f(s.adaptiveError)} | ${f(s.fixedBehind)} | ${f(s.adaptiveBehind)} | ${f(s.fixedPeak)} | ${f(s.adaptivePeak)} | ${f(s.replans)} |`).join('\n');
  return `# NexPath evaluation: fixed plan vs adaptive plan\n\n${runs} simulated students (goals x weekly hours x work patterns), each run twice. Lower is better in every column. Forecast error is how many days off the finish date shown to the student was, averaged over every week until they finished; weeks behind is how far behind the plan they were.\n\n${head}\n${body}\n`;
}

// `npm run evaluate`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const started = Date.now();
  const rows = runEvaluation();
  const summary = summarise(rows);
  const markdown = toMarkdown(summary, rows.length / 2);
  const directory = new URL('../../evaluation/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('results.csv', directory), toCsv(rows));
  await writeFile(new URL('results.md', directory), markdown);
  console.log(markdown);
  console.log(`Wrote evaluation/results.csv (${rows.length} rows) and evaluation/results.md in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
