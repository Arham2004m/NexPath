import { Clock } from 'lucide-react';

const format = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

// Turns to the error colour for the last five minutes; the hidden live region
// announces the five- and one-minute marks to screen readers only once each.
export default function AssessmentTimer({ remaining, limit }) {
  const low = remaining <= 300;
  const critical = remaining <= 60;
  return (
    <div className="flex items-center gap-3">
      <div className="hidden h-1.5 w-28 bg-pale/70 sm:block" aria-hidden="true">
        <div className={`h-full ${low ? 'bg-error' : 'bg-mid'}`} style={{ width: `${(remaining / limit) * 100}%` }} />
      </div>
      <p role="timer" aria-label={`${Math.ceil(remaining / 60)} minutes remaining`} className={`inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-sm font-medium tabular-nums ${low ? 'border-error text-error' : 'border-pale bg-white text-mid'} ${critical ? 'animate-pulse' : ''}`}>
        <Clock size={15} aria-hidden="true" />{format(remaining)}
      </p>
      <span className="sr-only" aria-live="polite">{critical ? 'One minute left.' : low ? 'Five minutes left.' : ''}</span>
    </div>
  );
}
