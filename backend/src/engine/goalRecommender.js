// Pure goal recommender: assessment profile in, ranked goals with plain-language reasons out.
// No DB/HTTP imports so it can be unit-tested and reused by the simulation harness later.
//
// fit = readiness + a small "entry-friendliness" boost for students who are still early.
//   readiness : weighted average of the domain strengths a goal depends on (0..1)
//   boost     : only for students whose overall strength is below EARLY_STAGE: they lean toward goals that
//               are realistic to start from. Students with a real specialty are ranked purely by readiness,
//               so broad goals like campus placements do not crowd out a better-fitting specialised goal.
// Recommendations are suggestions only; the student can pick any goal.

// How much each domain matters to a goal (rows sum to 1).
const WEIGHTS = {
  faang: { dsa: 0.45, sd: 0.2, prog: 0.15, os: 0.1, dbms: 0.1 },
  campus_placement: { prog: 0.3, dsa: 0.25, dbms: 0.15, os: 0.15, cn: 0.15 },
  gate: { dsa: 0.25, os: 0.2, dbms: 0.2, cn: 0.2, prog: 0.15 },
  ms_abroad: { dsa: 0.3, prog: 0.2, aiml: 0.2, os: 0.1, dbms: 0.1, cn: 0.1 },
  entrepreneur: { web: 0.35, prog: 0.25, dbms: 0.2, sd: 0.2 },
  ai_ml: { aiml: 0.5, prog: 0.3, dsa: 0.2 },
  web_dev: { web: 0.5, prog: 0.25, dbms: 0.15, cn: 0.1 },
  mobile_dev: { mobile: 0.5, prog: 0.3, dsa: 0.2 }
};

// How realistic each goal is to start from a low base (0..1).
const FRIENDLINESS = { campus_placement: 0.9, web_dev: 0.8, mobile_dev: 0.7, entrepreneur: 0.6, ai_ml: 0.5, gate: 0.5, faang: 0.35, ms_abroad: 0.35 };
const EARLY_STAGE = 0.35;
const BOOST = 0.2;

export const MATCH_LABELS = { strong: 'Strong match', good: 'Good match', start: 'Good place to start', stretch: 'Stretch goal' };
const labelFor = (fit, earliness, friendliness) => (fit >= 0.55 ? MATCH_LABELS.strong : fit >= 0.35 ? MATCH_LABELS.good : earliness > 0 && friendliness >= 0.7 ? MATCH_LABELS.start : MATCH_LABELS.stretch);

// Self-reported and not-reached domains count as zero strength: no evidence of skill.
const strengthOf = (entry) => (entry?.assessmentMethod === 'tested' ? entry.normalized : 0);

function suggestSubTrack(goalId, strength) {
  if (goalId === 'web_dev') return strength.web >= 0.5 && strength.dbms >= 0.4 ? 'fullstack' : 'frontend';
  if (goalId === 'mobile_dev') return 'flutter';
  return null;
}

// profile: { [domainKey]: { label, band, normalized?, assessmentMethod } } (as saved on an attempt)
// labels:  { [domainKey]: label } for domains absent from the profile
export function recommendGoals(profile = {}, labels = {}) {
  const domains = Object.keys(WEIGHTS.faang).concat(['web', 'aiml', 'cn', 'mobile']);
  const strength = Object.fromEntries([...new Set(domains)].map((d) => [d, strengthOf(profile[d])]));
  const labelOf = (d) => profile[d]?.label || labels[d] || d;
  const bandOf = (d) => profile[d]?.band || 'Beginner';
  const keys = Object.keys(strength);
  const overall = keys.reduce((sum, d) => sum + strength[d], 0) / keys.length;

  return Object.entries(WEIGHTS).map(([goalId, weights]) => {
    const entries = Object.entries(weights);
    const readiness = entries.reduce((sum, [d, w]) => sum + w * strength[d], 0);
    const earliness = Math.max(0, EARLY_STAGE - overall) / EARLY_STAGE;
    const fit = readiness + earliness * FRIENDLINESS[goalId] * BOOST;

    const strong = entries.filter(([d]) => strength[d] >= 0.4).sort((a, b) => b[1] * strength[b[0]] - a[1] * strength[a[0]]).slice(0, 2);
    const gap = entries.filter(([d]) => strength[d] < 0.4).sort((a, b) => b[1] - a[1])[0];
    const reasons = [
      ...strong.map(([d]) => `Builds on your ${labelOf(d)} (${bandOf(d)})`),
      ...(gap ? [`Key area to build: ${labelOf(gap[0])}`] : [])
    ];
    if (!strong.length) reasons.unshift('A realistic place to start from your current level');

    return { goalId, score: Number(fit.toFixed(3)), match: labelFor(fit, earliness, FRIENDLINESS[goalId]), reasons, suggestedSubTrack: suggestSubTrack(goalId, strength) };
  }).sort((a, b) => b.score - a.score || a.goalId.localeCompare(b.goalId));
}
