import { useId, useState } from 'react';
import { minutesLabel } from '../../lib/progress';

// Optional time log for one topic: minutes spent, saved as a separate event.
export default function LogTime({ topicId, logged, onLogTime }) {
  const [minutes, setMinutes] = useState('');
  const inputId = useId(); // the same topic can appear in the week list and in the skill panel at once
  const submit = (event) => {
    event.preventDefault();
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 1 || value > 1440) return;
    onLogTime(topicId, value);
    setMinutes('');
  };
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-bold text-mid">Log time{logged ? ` (${minutesLabel(logged)} so far)` : ''}</summary>
      <form onSubmit={submit} className="mt-2 flex items-center gap-2">
        <label className="sr-only" htmlFor={inputId}>Minutes spent</label>
        <input id={inputId} type="number" min="1" max="1440" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="minutes" className="w-28 border border-pale bg-white px-2.5 py-1.5 text-sm outline-none focus:border-mid" />
        <button type="submit" className="control-transition border border-pale bg-white px-3 py-1.5 text-xs font-extrabold text-ink hover:border-mid">Add</button>
      </form>
    </details>
  );
}
