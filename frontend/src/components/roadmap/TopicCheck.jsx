import { Check } from 'lucide-react';

// Square tick box for one topic. Overdue topics get a quiet warning ring so they are easy to spot.
export default function TopicCheck({ done, overdue, title, disabled, onToggle }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={done} disabled={disabled}
      aria-label={`${done ? 'Mark as not done' : 'Mark as done'}: ${title}`}
      onClick={() => onToggle(!done)}
      className={`control-transition grid h-6 w-6 shrink-0 place-items-center border-2 outline-none focus-visible:ring-2 focus-visible:ring-mid focus-visible:ring-offset-2 disabled:opacity-50 ${done ? 'border-mid bg-mid text-cream' : overdue ? 'border-error bg-white' : 'border-pale bg-white hover:border-mid'}`}
    >
      {done && <Check size={14} strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}
