import { Sparkles } from 'lucide-react';

// Top suggestions from the assessment. Purely advisory: any goal below can still be chosen.
export default function RecommendedGoals({ recommendations, goals, selectedId, onPick }) {
  const top = recommendations.slice(0, 3).map((rec) => ({ rec, goal: goals.find((g) => g.id === rec.goalId) })).filter((item) => item.goal);
  if (!top.length) return null;
  return (
    <section aria-labelledby="recommended-heading" className="surface-card feature-card px-6 py-7 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="recommended-heading" className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid"><Sparkles size={14} aria-hidden="true" /> Recommended for you</h2>
        <p className="text-xs text-muted">Based on your assessment. These are suggestions; you can choose any goal below.</p>
      </div>
      <ol className="mt-5 grid gap-4 md:grid-cols-3">
        {top.map(({ rec, goal }, i) => (
          <li key={goal.id} className={`flex flex-col border bg-[#F9FCFE] px-5 py-5 ${selectedId === goal.id ? 'border-mid' : 'border-[var(--rule)]'}`}>
            <p className="font-mono text-[10px] uppercase tracking-[.12em] text-mid">{i === 0 ? 'Top pick · ' : ''}{rec.match}</p>
            <p className="mt-2 text-lg font-extrabold leading-tight tracking-[-.04em] text-ink">{goal.label}</p>
            <ul className="mt-3 space-y-1.5 text-sm leading-6 text-muted">{rec.reasons.map((reason) => <li key={reason}>· {reason}</li>)}</ul>
            <button type="button" onClick={() => onPick(goal.id, rec.suggestedSubTrack)} aria-pressed={selectedId === goal.id}
              className="control-transition mt-auto self-start pt-4 text-sm font-extrabold text-mid underline-offset-4 hover:underline">
              {selectedId === goal.id ? 'Selected' : 'Choose this goal'}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
