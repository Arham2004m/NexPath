export default function SubTrackPicker({ goal, value, error, onChange }) {
  return (
    <fieldset>
      <legend className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Choose your {goal.id === 'web_dev' ? 'web' : 'mobile'} sub-track</legend>
      <div role="radiogroup" className="mt-4 grid gap-3 md:grid-cols-3">
        {goal.subTracks.map((track) => {
          const selected = value === track.id;
          return (
            <button key={track.id} type="button" role="radio" aria-checked={selected} onClick={() => onChange(track.id)}
              className={`control-transition surface-card px-5 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-mid ${selected ? 'border-l-[5px] border-l-mid bg-white' : 'hover:border-mid'}`}>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-extrabold tracking-[-.03em] text-ink">{track.label}</span>
                {track.recommended && <span className="bg-mid px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.1em] text-cream">Recommended for beginners</span>}
              </span>
              <span className="mt-2 block text-sm leading-6 text-muted">{track.description}</span>
              <span className="mt-3 block font-mono text-[11px] uppercase tracking-[.12em] text-muted">{track.weeks[0]}–{track.weeks[1]} weeks{track.roadmapReady === false ? ' · Roadmap coming soon' : ''}</span>
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-error">{error}</p>}
    </fieldset>
  );
}
