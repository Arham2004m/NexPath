import { AlertTriangle } from 'lucide-react';
import SummaryCard from '../home/SummaryCard';
import { longDate } from '../../lib/format';
import { paceSummary } from '../../lib/progress';

// One whole bar for the whole roadmap: dark fill = done, light track = still to do.
function OverallProgress({ progress, version }) {
  const pace = paceSummary(progress);
  return (
    <div className="surface-card mt-6 px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Progress · {progress.topicsDone} of {progress.topicsTotal} topics in this plan</p>
        <p className="text-sm font-extrabold text-ink">{progress.percentComplete}% done</p>
      </div>
      <div className="mt-3 h-2 bg-pale/60" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentComplete} aria-label="Roadmap progress"><div className="h-full bg-mid" style={{ width: `${progress.percentComplete}%` }} /></div>
      <p className="mt-3 text-sm leading-6 text-muted"><span className="font-bold text-ink">{pace.label}.</span> {pace.detail}{version > 1 ? ` This is version ${version} of your roadmap; finished work was kept.` : ''}</p>
    </div>
  );
}

export default function RoadmapSummary({ roadmap, progress, version = 1, goalLabel, trackLabel }) {
  const shortened = roadmap.nodes.filter((n) => n.status !== 'mastered' && n.skippedHours > 0);
  const selfKnown = roadmap.nodes.filter((n) => n.source === 'self').length;
  return (
    <div>
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">Your roadmap</p>
        <h1 className="mt-4 text-4xl font-extrabold leading-[.94] tracking-[-.065em] text-ink sm:text-6xl">{goalLabel}{trackLabel ? `, ${trackLabel}` : ''}.</h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-8 text-muted">Built from your assessment, ordered so every skill comes after the ones it depends on, and paced to {roadmap.hoursPerWeek} hours a week.</p>
      </header>

      <section className="summary-grid mt-9 grid md:grid-cols-[1.2fr_.9fr_.9fr]">
        <SummaryCard index={0} label="Duration" value={roadmap.totalWeeks ? `${roadmap.totalWeeks} weeks` : 'Complete'} detail={roadmap.totalWeeks ? `${roadmap.totalHours} hours of focused work still to do, finishing around ${longDate(roadmap.endDate)}.` : 'Every topic of this roadmap is finished.'} />
        <SummaryCard index={1} label="Skills to learn" value={roadmap.nodes.filter((n) => n.status !== 'mastered').length} detail={roadmap.masteredNodeIds.length ? `${roadmap.masteredNodeIds.length} skills you already know are marked, not repeated.` : 'Starting from the foundations.'} />
        <SummaryCard index={2} label="Time saved" value={`${roadmap.hoursSaved} h`} detail={roadmap.hoursSaved > 0 ? `Compared with the same goal from zero${shortened.length ? `; your answers shortened ${shortened.length} skill${shortened.length === 1 ? '' : 's'} partway` : ''}${selfKnown ? `; ${selfKnown} skill${selfKnown === 1 ? '' : 's'} you marked as known` : ''}.` : 'No prior skills were found, so this is the full path.'} />
      </section>

      {progress && <OverallProgress progress={progress} version={version} />}

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
