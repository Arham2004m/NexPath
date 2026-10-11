import Input from '../common/Input';
import { approxWeeks } from '../../lib/format';

export default function TimeCommitment({ hours, targetWeeks, limits, errors, estimatedHours, onHours, onTargetWeeks }) {
  return (
    <fieldset className="surface-card px-6 py-7 sm:px-8">
      <legend className="sr-only">Time commitment</legend>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Your time</p>
      <div className="mt-5 grid gap-8 md:grid-cols-2">
        <div>
          <label htmlFor="hoursPerWeek" className="flex items-baseline justify-between text-sm font-bold tracking-[-.01em] text-ink">
            Hours per week <span className="text-3xl font-extrabold tracking-[-.06em]">{hours}</span>
          </label>
          <input id="hoursPerWeek" type="range" min={limits.min} max={limits.max} value={hours} onChange={(e) => onHours(Number(e.target.value))} className="mt-4 w-full accent-[var(--color-mid,#1B6CA8)]" aria-describedby="hours-help" />
          <p id="hours-help" className="mt-2 text-xs text-muted">{limits.min}–{limits.max} hours. Be realistic; your roadmap is paced to this.{estimatedHours ? ` From zero, this goal takes about ${approxWeeks(estimatedHours, hours)} weeks at ${hours} h/week; your assessment can shorten that.` : ''}</p>
          {errors.hoursPerWeek && <p role="alert" className="mt-1.5 text-xs font-medium text-error">{errors.hoursPerWeek}</p>}
        </div>
        <div>
          <Input label="Target weeks (optional)" name="targetWeeks" type="number" inputMode="numeric" min="1" max="104" placeholder="e.g. 16" value={targetWeeks} onChange={(e) => onTargetWeeks(e.target.value)} error={errors.targetWeeks} />
          <p className="mt-2 text-xs text-muted">Have a deadline, like placements? Leave empty to let the roadmap set its own length.</p>
        </div>
      </div>
    </fieldset>
  );
}
