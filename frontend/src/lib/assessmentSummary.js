// Condenses an assessment attempt into one overall level plus the strongest domain.
// Self-reported domains count as 0 so skipping cannot raise the overall level.
const bandFor = (value) => (value < 0.4 ? 'Beginner' : value < 0.75 ? 'Intermediate' : 'Advanced');

export function summarizeAttempt(attempt) {
  const rows = Object.values(attempt?.profile || {});
  if (!rows.length) return null;
  const values = rows.map((r) => (r.assessmentMethod === 'tested' ? r.normalized : 0));
  const strongest = rows.filter((r) => r.assessmentMethod === 'tested').sort((a, b) => b.normalized - a.normalized)[0];
  return { level: bandFor(values.reduce((a, b) => a + b, 0) / values.length), strongest: strongest?.label || null };
}
