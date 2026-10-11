import { AlertTriangle } from 'lucide-react';
import SummaryCard from '../home/SummaryCard';
import { longDate } from '../../lib/format';

export default function RoadmapSummary({ roadmap, goalLabel, trackLabel }) {
  return (
    <div>
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">Your roadmap</p>
        <h1 className="mt-4 text-4xl font-extrabold leading-[.94] tracking-[-.065em] text-ink sm:text-6xl">{goalLabel}{trackLabel ? `, ${trackLabel}` : ''}.</h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-8 text-muted">Built from your assessment, ordered so every skill comes after the ones it depends on, and paced to {roadmap.hoursPerWeek} hours a week.</p>
      </header>

      <section className="summary-grid mt-9 grid md:grid-cols-[1.2fr_.9fr_.9fr]">
        <SummaryCard index={0} label="Duration" value={`${roadmap.totalWeeks} weeks`} detail={`${roadmap.totalHours} hours of focused work, finishing around ${longDate(roadmap.endDate)}.`} />
        <SummaryCard index={1} label="Skills to learn" value={roadmap.nodes.filter((n) => n.status !== 'mastered').length} detail={roadmap.masteredNodeIds.length ? `${roadmap.masteredNodeIds.length} skills you already know are marked, not repeated.` : 'Starting from the foundations.'} />
        <SummaryCard index={2} label="Time saved" value={`${roadmap.hoursSaved} h`} detail={roadmap.hoursSaved > 0 ? 'Compared with the same goal for someone starting from zero.' : 'No prior skills were found, so this is the full path.'} />
      </section>

      {!roadmap.feasible && (
        <div role="status" className="surface-card mt-6 flex items-start gap-4 border-l-[5px] border-l-error px-6 py-5">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
          <p className="text-sm leading-6 text-ink">
            <span className="font-bold">Your {roadmap.targetWeeks}-week target is tight.</span>{' '}
            {roadmap.achievable
              ? `This plan needs about ${roadmap.requiredHoursPerWeek} hours a week to fit; at ${roadmap.hoursPerWeek} hours it runs ${roadmap.totalWeeks} weeks. You can change your hours or target on the Goal page.`
              : `Even at the maximum weekly hours this plan does not fit in ${roadmap.targetWeeks} weeks. Consider a later target on the Goal page.`}
          </p>
        </div>
      )}
    </div>
  );
}
