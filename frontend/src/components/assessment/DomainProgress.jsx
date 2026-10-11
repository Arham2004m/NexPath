// One segment per domain: finished domains are solid, the current one is azure.
// Optional children (the timer) sit on the right of the label row.
export default function DomainProgress({ domains, index, children }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">
        <span>Domain {Math.min(index + 1, domains.length)} of {domains.length} · {Math.round((index / domains.length) * 100)}% complete</span>
        {children}
      </div>
      <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${domains.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {domains.map((domain, i) => <span key={domain.key} className={`h-1.5 ${i < index ? 'bg-mid' : i === index ? 'bg-[var(--color-azure)]' : 'bg-pale/70'}`} />)}
      </div>
    </div>
  );
}
