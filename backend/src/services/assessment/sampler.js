// Stratified random sampling: same difficulty MIX for every student,
// but different actual questions each time.

export function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Default pattern: 1 easy + 1 medium + 1 hard = 3 questions per domain (27 across 9 domains).
// `seen` maps questionId -> time the student last saw it. Unseen questions are
// picked first; once a tier runs out, those seen longest ago are reused.
export function sampleDomain(questions, pattern = { easy: 1, medium: 1, hard: 1 }, seen = new Map()) {
  const byDifficulty = { easy: [], medium: [], hard: [] };
  for (const q of questions) if (byDifficulty[q.difficulty]) byDifficulty[q.difficulty].push(q);

  const picked = [];
  for (const [difficulty, count] of Object.entries(pattern)) {
    const pool = shuffle(byDifficulty[difficulty] || []);
    const unseen = pool.filter((q) => !seen.has(q.id));
    const oldestFirst = pool.filter((q) => seen.has(q.id)).sort((a, b) => seen.get(a.id) - seen.get(b.id));
    picked.push(...[...unseen, ...oldestFirst].slice(0, count));
  }
  return shuffle(picked);
}
