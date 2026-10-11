import { ArrowRight, Layers, Scale, SkipForward } from 'lucide-react';
import Button from '../common/Button';

const principles = [
  [Layers, 'Fresh set every attempt', 'Three questions per domain — one easy, one medium, one hard — drawn at random from the question bank.'],
  [Scale, 'Harder answers weigh more', 'Easy questions earn 1 point, medium 2, hard 3. Each domain is banded Beginner, Intermediate or Advanced.'],
  [SkipForward, 'Skip what you have not studied', 'Say you are new to a domain and it is recorded as Beginner without any questions.']
];

export default function AssessmentIntro({ firstName, domains, loading, minutes = 25, onStart }) {
  return (
    <div className="dashboard-arrival">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">Skill assessment</p>
        <h1 className="mt-4 text-4xl font-extrabold leading-[.94] tracking-[-.065em] text-ink sm:text-6xl">Find where you stand{firstName ? `, ${firstName}` : ''}.</h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-8 text-muted">A short, randomized check across {domains.length || 'nine'} computer science domains. You have {minutes} minutes, and it gives your roadmap an honest starting point.</p>
      </header>

      <section className="summary-grid mt-11 grid md:grid-cols-3">
        {principles.map(([Icon, title, detail], i) => (
          <article key={title} className="summary-card p-6 sm:p-7" style={{ '--reveal-index': i }}>
            <Icon size={20} className="text-mid" aria-hidden="true" />
            <p className="mt-5 text-lg font-extrabold leading-tight tracking-[-.04em] text-ink">{title}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
          </article>
        ))}
      </section>

      <section className="surface-card feature-card mt-11 px-6 py-8 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Domains covered</p>
          {domains.length > 0 && <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-muted">{domains.length} domains</p>}
        </div>
        {loading ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-14 animate-pulse bg-warm" />)}</div>
        ) : (
          <ol className="mt-6 grid gap-3 sm:grid-cols-2">
            {domains.map((domain, i) => (
              <li key={domain.key} className="flex items-center gap-4 border border-[var(--rule)] bg-[#F9FCFE] px-4 py-3.5">
                <span className="font-mono text-xs font-medium text-mid">{String(i + 1).padStart(2, '0')}</span>
                <span className="flex-1 text-[15px] font-bold tracking-[-.02em] text-ink">{domain.label}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-5 border-t-2 section-rule pt-6">
          <Button onClick={onStart} disabled={loading || !domains.length}>Begin assessment <ArrowRight size={16} /></Button>
          <p className="text-sm leading-6 text-muted">The {minutes}-minute timer starts when you begin. When it runs out, your answers so far are submitted automatically.</p>
        </div>
      </section>
    </div>
  );
}
