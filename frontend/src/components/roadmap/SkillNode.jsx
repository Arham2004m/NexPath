import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Check } from 'lucide-react';
import { NODE_HEIGHT, NODE_WIDTH } from '../../lib/roadmapLayout';
import { weekRange } from '../../lib/format';

// Visual language: known = pale and quiet, next = deep blue (start here), upcoming = white with an azure rule.
const styles = {
  mastered: { box: 'border-pale bg-[#E7F4FC] text-muted', rail: 'bg-pale', tag: 'Already known' },
  next: { box: 'border-mid bg-mid text-cream shadow-[0_12px_26px_rgba(15,76,117,.25)]', rail: 'bg-[var(--color-pale)]', tag: 'Start here' },
  upcoming: { box: 'border-[var(--rule)] bg-white text-ink shadow-[0_10px_24px_rgba(15,76,117,.08)]', rail: 'bg-[var(--color-azure)]', tag: null }
};

function SkillNode({ data }) {
  const { node, selected, onSelect } = data;
  const style = styles[node.status] || styles.upcoming;
  const hidden = { opacity: 0, pointerEvents: 'none', width: 1, height: 1 };
  return (
    <>
      <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        aria-pressed={selected}
        aria-label={`${node.name}, ${node.status === 'mastered' ? 'already known' : weekRange(node)}, ${node.estimatedHours} hours. Open details`}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
        className={`control-transition relative flex flex-col justify-between overflow-hidden border px-5 py-3.5 text-left outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-mid ${style.box} ${selected ? 'ring-2 ring-[var(--color-azure)] ring-offset-2' : ''}`}
      >
        <span className={`absolute inset-y-0 left-0 w-1.5 ${style.rail}`} aria-hidden="true" />
        <span className="flex items-center justify-between gap-2 font-mono text-[10px] font-medium uppercase tracking-[.12em] opacity-80">
          <span>{style.tag || (node.startWeek ? weekRange(node) : '')}</span>
          {node.status === 'mastered' && <Check size={13} aria-hidden="true" />}
        </span>
        <span className="line-clamp-2 text-[15px] font-extrabold leading-tight tracking-[-.03em]">{node.name}</span>
        <span className="font-mono text-[10px] uppercase tracking-[.1em] opacity-70">{node.status === 'next' && node.startWeek ? `${weekRange(node)} · ` : ''}{node.estimatedHours} h</span>
      </button>
      <Handle type="source" position={Position.Bottom} style={hidden} isConnectable={false} />
    </>
  );
}

export default memo(SkillNode);
