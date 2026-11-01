import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import ResourceList from './ResourceList';
import TopicCheck from './TopicCheck';
import { minutesLabel } from '../../lib/progress';
import { weekRange } from '../../lib/format';

const statusText = { mastered: 'Already known from your assessment', next: 'Start here', upcoming: 'Coming up', done: 'Completed' };
const statusFor = (node) => (node.status === 'mastered' && node.source === 'self' ? 'Marked as known by you' : statusText[node.status]);

// Side panel (bottom sheet on small screens) with everything about one skill.
// Optional time log for one topic: minutes spent, saved as a separate event.
function LogTime({ topicId, logged, onLogTime }) {
  const [minutes, setMinutes] = useState('');
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
        <label className="sr-only" htmlFor={`min-${topicId}`}>Minutes spent</label>
        <input id={`min-${topicId}`} type="number" min="1" max="1440" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="minutes" className="w-28 border border-pale bg-white px-2.5 py-1.5 text-sm outline-none focus:border-mid" />
        <button type="submit" className="control-transition border border-pale bg-white px-3 py-1.5 text-xs font-extrabold text-ink hover:border-mid">Add</button>
      </form>
    </details>
  );
}

export default function NodeDetails({ node, nameOf, progress, onClose, onToggleKnown, onToggleTopic, onLogTime, busy, notice }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node.id, onClose]);

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="node-title" className="surface-card feature-card fixed inset-x-0 bottom-0 z-30 max-h-[78vh] overflow-y-auto px-6 py-6 lg:static lg:max-h-none lg:w-[26rem] lg:shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">{statusFor(node)}</p>
          <h2 id="node-title" className="mt-2 text-2xl font-extrabold leading-tight tracking-[-.05em] text-ink">{node.name}</h2>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[.12em] text-muted">{node.status === 'mastered' ? `${node.estimatedHours} h skipped` : `${weekRange(node)} · ${node.estimatedHours} h`}</p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close details" className="control-transition p-1 text-muted hover:text-ink"><X size={20} /></button>
      </div>

      <div className="mt-4">
        {node.status === 'mastered' && node.source === 'self' && (
          <button type="button" disabled={busy} onClick={() => onToggleKnown(node.id, false)} className="control-transition inline-flex min-h-10 items-center border border-pale bg-white px-4 text-sm font-extrabold text-ink hover:border-mid disabled:opacity-60">I do not know this yet: add it back</button>
        )}
        {node.status === 'mastered' && node.source !== 'self' && <p className="text-sm leading-6 text-muted">Skipped because of your assessment result.</p>}
        {node.status !== 'mastered' && !node.capstone && (
          <button type="button" disabled={busy} onClick={() => onToggleKnown(node.id, true)} className="control-transition inline-flex min-h-10 items-center border border-pale bg-white px-4 text-sm font-extrabold text-ink hover:border-mid disabled:opacity-60">I already know this: skip it</button>
        )}
        {node.capstone && <p className="text-sm leading-6 text-muted"><span className="font-bold text-ink">Final hands-on skill.</span> It always stays in your plan, because this is where you prove the rest.</p>}
        {notice && <p role="alert" className="mt-2 text-xs font-medium text-error">{notice}</p>}
      </div>
      {node.skippedHours > 0 && <p className="mt-3 text-sm leading-6 text-muted">Your answers already cover part of this skill, so {node.skippedHours} h are skipped or shortened.</p>}

      {node.prerequisites.length > 0 && (
        <p className="mt-4 text-sm leading-6 text-muted"><span className="font-bold text-ink">Builds on:</span> {node.prerequisites.map(nameOf).join(', ')}</p>
      )}

      <h3 className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Topics and mini tasks</h3>
      <ol className="mt-3 space-y-3">
        {node.topics.map((topic, index) => {
          const planned = !topic.credited && !topic.done && node.status !== 'mastered';
          const status = progress?.topicStatus[topic.id];
          const isDone = topic.done || status === 'done';
          return (
            <li key={topic.id} className={`border border-[var(--rule)] px-4 py-3 ${topic.credited ? 'bg-[#E7F4FC] opacity-80' : 'bg-[#F9FCFE]'}`}>
              <div className="flex items-start gap-3">
                {planned && <TopicCheck done={isDone} overdue={status === 'overdue'} title={topic.title} onToggle={(next) => onToggleTopic(topic.id, next)} />}
                {topic.done && <span className="grid h-6 w-6 shrink-0 place-items-center border-2 border-mid bg-mid text-cream" aria-label="Finished earlier"><Check size={14} strokeWidth={3} aria-hidden="true" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-3 text-sm font-bold text-ink"><span className={topic.credited || isDone ? 'text-muted line-through' : ''}>{topic.title}</span><span className="shrink-0 font-mono text-[11px] font-medium text-muted">{topic.credited ? 'skipped' : topic.done ? 'finished earlier' : `${topic.trimmedHours ? topic.plannedHours : topic.hours} h${topic.startWeek ? ` · ${weekRange(topic)}` : ''}`}</span></p>
                  {status === 'overdue' && <p className="mt-1 font-mono text-[10px] uppercase tracking-[.1em] text-error">Overdue</p>}
                  {topic.trimmedHours > 0 && <p className="mt-1 text-xs leading-5 text-muted">A lighter pass: {topic.trimmedHours} h shorter than usual because of your answers.</p>}
                  {node.miniTasks[index] && !topic.credited && !isDone && <p className="mt-1.5 text-xs leading-5 text-muted"><span className="font-bold text-ink">Mini task:</span> {node.miniTasks[index]}</p>}
                  {planned && <LogTime topicId={topic.id} logged={progress?.minutesByTopic[topic.id]} onLogTime={onLogTime} />}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <h3 className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Where to learn it</h3>
      <div className="mt-3"><ResourceList resources={node.resources} /></div>
    </aside>
  );
}
