// Turns what we know about a student into what their roadmap can skip. Pure functions.
//
// 1. Whole skills (band rule): Beginner -> nothing; Intermediate -> level-1 skills of the domain; Advanced -> level 1 and 2.
//    Level-3 skills are never skipped by an assessment.
// 2. Partial credit (score rule): inside a band the score still matters. A student near the top of a band has also
//    covered part of the next level, so the first topics of those skills are skipped (never the last topic of a skill,
//    never a capstone, never level 3). Credit goes first to skills whose own questions were answered correctly, and
//    never to skills whose questions were answered wrong. Credit that cannot cover a whole topic shortens the next topic
//    (a lighter pass over what the student half-knows), so every extra point changes the plan.
// 3. Self-reports: skills the student says they already know are skipped whole (capstones excepted); this is the only way to
//    personalise areas the assessment does not cover (theory, aptitude, research, business...).
//
// Nodes can carry `tracks` (e.g. mobile stacks); they are only credited when the student's sub-track matches.
import { capstonesOf, indexNodes, neededClosure, resolveGoalPath } from './graph.js';

const BAND_CAP = { Beginner: 0, Intermediate: 1, Advanced: 2 };
const BAND_RANGE = { Beginner: [0, 0.4], Intermediate: [0.4, 0.75], Advanced: [0.75, 1] };
export const MAX_CREDIT_LEVEL = 2; // level-3 skills are never credited
export const PARTIAL_SHARE = 0.5; // at most half of the next level can be credited from score alone

const trackOk = (node, subTrack) => !node.tracks || (subTrack && node.tracks.includes(subTrack));

// Whole skills by band only (the rule in section 7.1 of the handoff).
export function masteredNodeIds(nodes, profile = {}, subTrack = null) {
  const mastered = [];
  for (const node of nodes) {
    const entry = profile[node.domain];
    if (!entry || entry.assessmentMethod !== 'tested') continue;
    if (node.level > (BAND_CAP[entry.band] ?? 0)) continue;
    if (!trackOk(node, subTrack)) continue;
    mastered.push(node.id);
  }
  return mastered.sort();
}

// Share of the next level covered, from where the score sits inside its band (0..PARTIAL_SHARE).
export function partialShare(entry) {
  const range = BAND_RANGE[entry.band];
  if (!range || !(entry.normalized > 0)) return 0;
  const position = Math.min(1, Math.max(0, (entry.normalized - range[0]) / (range[1] - range[0])));
  return position * PARTIAL_SHARE;
}

// results: { [domain]: [{ id, nodeId, correct }] } from the saved attempt (optional).
export function planMastery({ nodes, goalPaths, goalId, subTrack = null, profile = {}, results = {}, selfKnown = [] }) {
  const path = resolveGoalPath(goalPaths, goalId, subTrack);
  if (!path) return { mastered: [], credits: {}, trims: {}, sources: {} };
  const byId = indexNodes(nodes);
  const capstones = new Set(capstonesOf(path));

  const sources = {};
  for (const id of masteredNodeIds(nodes, profile, subTrack)) sources[id] = 'assessment';
  for (const id of selfKnown) if (byId.has(id) && !sources[id]) sources[id] = 'self';
  for (const id of capstones) delete sources[id];
  const mastered = Object.keys(sources).sort();

  // Partial credit applies only to skills still to be learned for this goal.
  const { needed } = neededClosure(byId, path.required, new Set(mastered));
  const priority = new Map(path.required.map((id, index) => [id, index]));
  const credits = {};
  const trims = {};

  for (const [domain, entry] of Object.entries(profile)) {
    if (entry.assessmentMethod !== 'tested') continue;
    const nextLevel = (BAND_CAP[entry.band] ?? 0) + 1;
    if (nextLevel > MAX_CREDIT_LEVEL) continue;
    const share = partialShare(entry);
    if (share <= 0) continue;

    const evidence = new Map();
    for (const result of results[domain] || []) {
      if (!result.nodeId) continue;
      const tally = evidence.get(result.nodeId) || { right: 0, wrong: 0 };
      tally[result.correct ? 'right' : 'wrong']++;
      evidence.set(result.nodeId, tally);
    }
    const nextLevelNodes = [...needed]
      .map((id) => byId.get(id))
      .filter((node) => node.domain === domain && node.level === nextLevel && trackOk(node, subTrack) && !capstones.has(node.id));
    // The size of the credit follows the score; the evidence only decides where it goes.
    let pool = share * nextLevelNodes.reduce((sum, node) => sum + node.estimatedHours, 0);
    const candidates = nextLevelNodes
      .filter((node) => { const tally = evidence.get(node.id); return !(tally && tally.wrong > 0 && tally.right === 0); })
      .sort((a, b) => (evidence.get(b.id)?.right ?? 0) - (evidence.get(a.id)?.right ?? 0) || (priority.get(a.id) ?? 1e9) - (priority.get(b.id) ?? 1e9) || a.id.localeCompare(b.id));

    allocation: for (const node of candidates) {
      for (let index = 0; index < node.topics.length - 1; index++) {
        const hours = node.topics[index].hours;
        if (hours <= pool) { pool -= hours; credits[node.id] = index + 1; continue; }
        // Leftover credit shortens this topic, always keeping at least one hour of it.
        const trim = Math.min(Math.floor(pool), hours - 1);
        if (trim >= 1) trims[node.id] = { topicIndex: index, hours: trim };
        break allocation;
      }
    }
  }
  return { mastered, credits, trims, sources };
}
