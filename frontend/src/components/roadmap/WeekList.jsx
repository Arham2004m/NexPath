import ResourceList from './ResourceList';
import { shortDate } from '../../lib/format';

// Week-by-week plan: the accessible, mobile-friendly twin of the skill tree.
export default function WeekList({ roadmap }) {
  const known = roadmap.nodes.filter((n) => n.status === 'mastered');
  return (
    <div className="space-y-5">
      {known.length > 0 && (
        <section className="surface-card px-6 py-5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Already known · skipped</p>
          <p className="mt-2 text-sm leading-6 text-muted">{known.map((n) => n.name).join(' · ')}</p>
        </section>
      )}
      {roadmap.weeks.map((week) => (
        <article key={week.index} className={`surface-card px-6 py-6 sm:px-8 ${week.index === 1 ? 'feature-card' : ''}`}>
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-2xl font-extrabold tracking-[-.05em] text-ink">Week {week.index}</h3>
            <p className="font-mono text-[11px] uppercase tracking-[.12em] text-muted">{shortDate(week.startDate)} – {shortDate(week.endDate)} · {week.plannedHours} h</p>
          </header>
          <ul className="mt-4 space-y-2">
            {week.topics.map((topic) => (
              <li key={`${topic.topicId}-${topic.continued}`} className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] pb-2 text-[15px]">
                <span><span className="font-bold text-ink">{topic.title}</span>{topic.continued ? <span className="text-muted"> (continued)</span> : null}<span className="block text-xs text-muted">{topic.nodeName}</span></span>
                <span className="shrink-0 font-mono text-[11px] text-muted">{topic.hours} h</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-6 text-ink"><span className="font-extrabold">Mini task:</span> <span className="text-muted">{week.miniTask.text}</span></p>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-extrabold text-mid">Resources for this week ({week.resources.length})</summary>
            <div className="mt-3"><ResourceList resources={week.resources} compact /></div>
          </details>
        </article>
      ))}
    </div>
  );
}
