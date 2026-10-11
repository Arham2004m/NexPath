// Weighted scoring: harder correct answers count for more.
export const WEIGHTS = { easy: 1, medium: 2, hard: 3 };

export function bandFor(normalized) {
  if (normalized < 0.4) return 'Beginner';
  if (normalized < 0.75) return 'Intermediate';
  return 'Advanced';
}

// questions: [{ id, difficulty, correct }] (authoritative, from the DB)
// answers:   { [questionId]: selectedOptionIndex }
export function scoreDomain(questions, answers) {
  let score = 0;
  let max = 0;
  for (const q of questions) {
    const weight = WEIGHTS[q.difficulty] || 1;
    max += weight;
    if (answers[q.id] === q.correct) score += weight;
  }
  const normalized = max > 0 ? score / max : 0;
  return { score, max, normalized: Number(normalized.toFixed(2)), band: bandFor(normalized) };
}
