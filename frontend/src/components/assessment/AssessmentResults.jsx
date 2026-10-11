import { Link } from 'react-router-dom';
import { AlarmClock, RotateCcw } from 'lucide-react';
import Button from '../common/Button';

// A light-to-deep blue scale keeps the three bands inside the NexPath palette.
const bandStyles = {
  Beginner: { rail: 'bg-pale', pill: 'bg-[#E7F4FC] text-mid' },
  Intermediate: { rail: 'bg-[var(--color-azure)]', pill: 'bg-[var(--color-azure)] text-cream' },
  Advanced: { rail: 'bg-mid', pill: 'bg-mid text-cream' }
};

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function AssessmentResults({ attempt, domains = [], onRetake }) {
  const rows = Object.entries(attempt.profile);
  // Domains the timer cut off before the student reached them are not scored.
  const notReached = domains.filter((d) => !attempt.profile[d.key]);
  const timing = attempt.timing;
  const tested = rows.filter(([, r]) => r.assessmentMethod === 'tested');
  const score = tested.reduce((sum, [, r]) => sum + r.score, 0);
  const max = tested.reduce((sum, [, r]) => sum + r.max, 0);
  const count = (band) => rows.filter(([, r]) => r.band === band).length;

  return (
    <div className="dashboard-arrival">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">Assessment complete</p>
        <h1 className="mt-4 text-4xl font-extrabold leading-[.94] tracking-[-.065em] text-ink sm:text-6xl">Here is your baseline.</h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-8 text-muted">Results for <strong className="font-bold text-ink">{attempt.name}</strong>, saved {new Date(attempt.timestamp).toLocaleString()}{timing && !timing.timedOut ? `, finished in ${clock(timing.durationSeconds)}` : ''}.</p>
      </header>

      {timing?.timedOut && (
        <div role="status" className="surface-card mt-8 flex items-start gap-4 border-l-[5px] border-l-error px-6 py-5">
          <AlarmClock size={20} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
          <div>
            <p className="font-bold text-ink">Time ran out, so your assessment was submitted automatically.</p>
            <p className="mt-1 text-sm leading-6 text-muted">Answers you had chosen were scored; unanswered questions count as incorrect{notReached.length ? `, and ${notReached.length} domain${notReached.length === 1 ? ' was' : 's were'} not reached` : ''}.</p>
          </div>
        </div>
      )}

      <section className="summary-grid mt-11 grid md:grid-cols-[1.2fr_.9fr_.9fr]">
        <article className="summary-card p-6 sm:p-7" style={{ '--reveal-index': 0 }}>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.12em] text-mid">Weighted score</p>
          <p className="mt-5 text-3xl font-extrabold leading-none tracking-[-.06em] text-ink">{max ? `${Math.round((score / max) * 100)}%` : '—'}</p>
          <p className="mt-3 text-sm leading-6 text-muted">{max ? `${score} of ${max} points across ${tested.length} tested domain${tested.length === 1 ? '' : 's'}.` : 'Every domain was self-reported.'}</p>
        </article>
        <article className="summary-card p-6 sm:p-7" style={{ '--reveal-index': 1 }}>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.12em] text-mid">Bands</p>
          <p className="mt-5 text-3xl font-extrabold leading-none tracking-[-.06em] text-ink">{count('Advanced')} · {count('Intermediate')} · {count('Beginner')}</p>
          <p className="mt-3 text-sm leading-6 text-muted">Advanced · Intermediate · Beginner</p>
        </article>
        <article className="summary-card p-6 sm:p-7" style={{ '--reveal-index': 2 }}>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.12em] text-mid">Method</p>
          <p className="mt-5 text-3xl font-extrabold leading-none tracking-[-.06em] text-ink">{tested.length} tested</p>
          <p className="mt-3 text-sm leading-6 text-muted">{rows.length - tested.length} self-reported as new{notReached.length ? ` · ${notReached.length} not reached` : ''}.</p>
        </article>
      </section>

      <section className="mt-11 space-y-3">
        {rows.map(([key, r]) => {
          const style = bandStyles[r.band] || bandStyles.Beginner;
          const pct = r.assessmentMethod === 'tested' ? Math.round(r.normalized * 100) : 0;
          return (
            <article key={key} className="surface-card relative grid gap-4 overflow-hidden py-5 pl-7 pr-6 sm:grid-cols-[1fr_12rem_auto] sm:items-center">
              <span className={`absolute inset-y-0 left-0 w-1.5 ${style.rail}`} aria-hidden="true" />
              <div>
                <p className="text-lg font-extrabold tracking-[-.035em] text-ink">{r.label}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[.12em] text-muted">{r.assessmentMethod === 'tested' ? 'Tested · MCQ' : 'Self-reported · skipped'}</p>
              </div>
              <div>
                {r.assessmentMethod === 'tested' ? (
                  <>
                    <div className="flex justify-between text-sm"><span className="font-bold text-ink">{r.score}/{r.max} pts</span><span className="text-muted">{pct}%</span></div>
                    <div className="mt-2 h-1.5 bg-warm"><div className={`h-full ${style.rail}`} style={{ width: `${pct}%` }} /></div>
                  </>
                ) : <p className="text-sm text-muted">No prior study</p>}
              </div>
              <span className={`w-fit px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[.12em] ${style.pill}`}>{r.band}</span>
            </article>
          );
        })}
        {notReached.map((d) => (
          <article key={d.key} className="surface-card relative grid gap-4 overflow-hidden py-5 pl-7 pr-6 opacity-80 sm:grid-cols-[1fr_12rem_auto] sm:items-center">
            <span className="absolute inset-y-0 left-0 w-1.5 bg-warm" aria-hidden="true" />
            <div>
              <p className="text-lg font-extrabold tracking-[-.035em] text-ink">{d.label}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[.12em] text-muted">Time ran out · not scored</p>
            </div>
            <p className="text-sm text-muted">Not attempted</p>
            <span className="w-fit border border-pale px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[.12em] text-muted">Not reached</span>
          </article>
        ))}
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t-2 section-rule pt-7">
        <Button onClick={onRetake} className="!bg-white !text-ink border border-pale !shadow-none hover:!bg-white hover:border-mid"><RotateCcw size={16} /> Take another assessment</Button>
        <Link to="/home" className="control-transition inline-flex min-h-12 items-center border border-pale bg-white px-5 text-sm font-extrabold text-ink hover:border-mid hover:text-mid">Back to dashboard</Link>
      </div>
    </div>
  );
}
