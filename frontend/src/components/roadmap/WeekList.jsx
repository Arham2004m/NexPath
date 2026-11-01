import ResourceList from './ResourceList';
import TopicCheck from './TopicCheck';
import { shortDate } from '../../lib/format';

// Week-by-week plan: the accessible, mobile-friendly twin of the skill tree. Topics can be ticked off right here.
export default function WeekList({ roadmap, progress, onToggleTopic }) {
  const known = roadmap.nodes.filter((n) => n.status === 'mastered');
  const finishedEarlier = roadmap.completedTopics || [];
  return (
    <div className="space-y-5">
      {known.length > 0 && (
        <section className="surface-card px-6 py-5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Already known · skipped</p>
          <p className="mt-2 text-sm leading-6 text-muted">{known.map((n) => n.name).join(' · ')}</p>
        </section>
      )}
      {finishedEarlier.length > 0 && (
        <section className="surface-card px-6 py-5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Finished before this version · {finishedEarlier.length} topics</p>
          <p className="mt-2 text-sm leading-6 text-muted">{finishedEarlier.map((t) => t.title).join(' · ')}</p>
        </section>
      )}
      {roadmap.weeks.length === 0 && (
        <section className="surface-card feature-card px-6 py-8">
          <p className="text-xl font-extrabold tracking-[-.04em] text-ink">Nothing left to schedule.</p>
          <p className="mt-2 text-sm leading-6 text-muted">Every topic of this roadmap is finished.</p>
        </section>
      )}
      {roadmap.weeks.map((week) => {
        const current = progress?.weekly[week.index - 1]?.state === 'current';
        const done = progress?.weekly[week.index - 1]?.completedHours ?? 0;
        return (
          <article key={week.index} className={`surface-card px-6 py-6 sm:px-8 ${current || week.index === 1 ? 'feature-card' : ''}`}>
            <header className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-2xl font-extrabold tracking-[-.05em] text-ink">Week {week.index}{current && <span className="ml-3 bg-[#E7F4FC] px-2 py-0.5 align-middle font-mono text-[10px] font-medium uppercase tracking-[.12em] text-mid">This week</span>}</h3>
              <p className="font-mono text-[11px] uppercase tracking-[.12em] text-muted">{shortDate(week.startDate)} – {shortDate(week.endDate)} · {done} of {week.plannedHours} h done</p>
            </header>
            <ul className="mt-4 space-y-2">
              {week.topics.map((topic) => {
                const status = progress?.topicStatus[topic.topicId];
                const isDone = status === 'done';
                return (
                  <li key={`${topic.topicId}-${topic.continued}`} className="flex items-start gap-3 border-b border-[var(--rule)] pb-2 text-[15px]">
                    <TopicCheck done={isDone} overdue={status === 'overdue'} title={topic.title} onToggle={(next) => onToggleTopic(topic.topicId, next)} />
                    <span className="min-w-0 flex-1">
                      <span className={`font-bold ${isDone ? 'text-muted line-through' : 'text-ink'}`}>{topic.title}</span>{topic.continued ? <span className="text-muted"> (continued)</span> : null}
                      {status === 'overdue' && <span className="ml-2 font-mono text-[10px] uppercase tracking-[.1em] text-error">Overdue</span>}
                      <span className="block text-xs text-muted">{topic.nodeName}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">{topic.hours} h</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-sm leading-6 text-ink"><span className="font-extrabold">Mini task:</span> <span className="text-muted">{week.miniTask.text}</span></p>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-extrabold text-mid">Resources for this week ({week.resources.length})</summary>
              <div className="mt-3"><ResourceList resources={week.resources} compact /></div>
            </details>
          </article>
        );
      })}
    </div>
  );
}
