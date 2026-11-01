import { useState } from 'react';
import { Compass, Sparkles } from 'lucide-react';
import { hoursLabel } from '../../lib/progress';

// What the plan did and why. Shown once after an automatic replan until the student has read it, and, separately,
// the offer to plan for fewer hours when three weeks in a row went below 60% of the plan. Nothing here changes
// anything by itself: the offer only applies when the student presses the button.
export default function ReplanBanner({ event, suggestion, busy, onDismiss, onAcceptHours, onKeepHours }) {
  const [asking, setAsking] = useState(false);
  if (!event && !suggestion) return null;
  const shift = event?.action === 'shift';
  const Icon = shift ? Compass : Sparkles;
  const metrics = event?.metrics;

  return (
    <div className="mt-6 space-y-4">
      {event && (
        <section role="status" aria-labelledby="replan-title" className="surface-card feature-card px-6 py-5 sm:px-8">
          <div className="flex items-start gap-4">
            <Icon size={22} className="mt-1 shrink-0 text-mid" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 id="replan-title" className="text-lg font-extrabold tracking-[-.04em] text-ink">{shift ? 'Your plan was adjusted' : 'You are ahead, so we added some extras'}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">{event.message}</p>
              {metrics && metrics.weeksEnded > 0 && (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[.1em] text-muted">
                  Based on {hoursLabel(metrics.plannedHours)} planned and {hoursLabel(metrics.completedHours)} done over {metrics.weeksEnded} finished week{metrics.weeksEnded === 1 ? '' : 's'}
                </p>
              )}
              <button type="button" onClick={() => onDismiss(event)} disabled={busy} className="control-transition mt-4 inline-flex min-h-10 items-center border border-pale bg-white px-4 text-sm font-extrabold text-ink hover:border-mid disabled:opacity-60">Got it</button>
            </div>
          </div>
        </section>
      )}

      {suggestion && (
        <section aria-labelledby="hours-offer-title" className="surface-card px-6 py-5 sm:px-8">
          <h2 id="hours-offer-title" className="text-lg font-extrabold tracking-[-.04em] text-ink">Would fewer hours a week suit you better?</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            In each of the last {suggestion.weeks} weeks you finished less than 60% of the plan, about {hoursLabel(suggestion.averageCompletedHours)} of {suggestion.currentHoursPerWeek} hours a week.
            A plan for {suggestion.hoursPerWeek} hours a week would match what is really happening, and your finished work is kept either way.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || asking} onClick={async () => { setAsking(true); try { await onAcceptHours(suggestion.hoursPerWeek); } finally { setAsking(false); } }} className="control-transition inline-flex min-h-10 items-center bg-mid px-4 text-sm font-extrabold text-cream hover:bg-deep disabled:opacity-60">Plan for {suggestion.hoursPerWeek} hours a week</button>
            <button type="button" disabled={busy || asking} onClick={() => onKeepHours(suggestion)} className="control-transition inline-flex min-h-10 items-center border border-pale bg-white px-4 text-sm font-extrabold text-ink hover:border-mid disabled:opacity-60">Keep {suggestion.currentHoursPerWeek} hours a week</button>
          </div>
        </section>
      )}
    </div>
  );
}
