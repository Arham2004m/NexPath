import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import ResourceList from './ResourceList';
import { weekRange } from '../../lib/format';

const statusText = { mastered: 'Already known from your assessment', next: 'Start here', upcoming: 'Coming up' };

// Side panel (bottom sheet on small screens) with everything about one skill.
export default function NodeDetails({ node, nameOf, onClose }) {
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
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">{statusText[node.status]}</p>
          <h2 id="node-title" className="mt-2 text-2xl font-extrabold leading-tight tracking-[-.05em] text-ink">{node.name}</h2>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[.12em] text-muted">{node.status === 'mastered' ? `${node.estimatedHours} h skipped` : `${weekRange(node)} · ${node.estimatedHours} h`}</p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close details" className="control-transition p-1 text-muted hover:text-ink"><X size={20} /></button>
      </div>

      {node.prerequisites.length > 0 && (
        <p className="mt-4 text-sm leading-6 text-muted"><span className="font-bold text-ink">Builds on:</span> {node.prerequisites.map(nameOf).join(', ')}</p>
      )}

      <h3 className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Topics and mini tasks</h3>
      <ol className="mt-3 space-y-3">
        {node.topics.map((topic, index) => (
          <li key={topic.id} className="border border-[var(--rule)] bg-[#F9FCFE] px-4 py-3">
            <p className="flex items-baseline justify-between gap-3 text-sm font-bold text-ink"><span>{topic.title}</span><span className="shrink-0 font-mono text-[11px] font-medium text-muted">{topic.hours} h{topic.startWeek ? ` · ${weekRange(topic)}` : ''}</span></p>
            {node.miniTasks[index] && <p className="mt-1.5 text-xs leading-5 text-muted"><span className="font-bold text-ink">Mini task:</span> {node.miniTasks[index]}</p>}
          </li>
        ))}
      </ol>

      <h3 className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Where to learn it</h3>
      <div className="mt-3"><ResourceList resources={node.resources} /></div>
    </aside>
  );
}
