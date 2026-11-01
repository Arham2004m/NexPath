import { shortDate } from '../../lib/format';

const labels = { shift: 'Rescheduled', enrich: 'Extras added' };

// The last few automatic changes to the plan, newest first, so the student can always see what changed and when.
export default function ReplanHistory({ events }) {
  if (!events?.length) return <p className="mt-3 text-sm leading-6 text-muted">Your plan has not needed any automatic changes yet. If you fall two weeks behind, or get a week ahead, it adapts and the change is listed here.</p>;
  return (
    <ol className="mt-4 space-y-3">
      {events.map((event) => (
        <li key={event.id} className="border border-[var(--rule)] bg-[#F9FCFE] px-4 py-3">
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-extrabold text-ink">{labels[event.action] || 'Plan changed'}</span>
            <span className="font-mono text-[11px] uppercase tracking-[.1em] text-muted">{shortDate(event.createdAt.slice(0, 10))} · version {event.fromVersion} to {event.toVersion}</span>
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">{event.message}</p>
        </li>
      ))}
    </ol>
  );
}
