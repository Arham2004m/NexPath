import { Check } from 'lucide-react';
import { effortLabel } from '../../lib/format';

export default function GoalCard({ goal, selected, match, onSelect }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={() => onSelect(goal.id)}
      className={`control-transition surface-card relative flex h-full flex-col px-6 py-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-mid ${selected ? 'border-l-[5px] border-l-mid bg-white' : 'hover:-translate-y-px hover:border-mid'}`}>
      {selected && <Check size={18} className="absolute right-4 top-4 text-mid" aria-hidden="true" />}
      {match && <p className="mb-2 w-fit bg-[#E7F4FC] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.1em] text-mid">{match}</p>}
      <p className="pr-6 text-lg font-extrabold leading-tight tracking-[-.04em] text-ink">{goal.label}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{goal.description}</p>
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {goal.focus.map((item) => <li key={item} className="bg-[#E7F4FC] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[.1em] text-mid">{item}</li>)}
      </ul>
      <p className="mt-auto pt-5 font-mono text-[11px] uppercase tracking-[.12em] text-muted">{goal.roadmapReady === false ? 'Roadmap coming soon' : effortLabel(goal.estimatedHours)}</p>
    </button>
  );
}
