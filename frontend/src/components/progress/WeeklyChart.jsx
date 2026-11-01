import { useEffect, useRef, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { minutesLabel } from '../../lib/progress';
import { shortDate } from '../../lib/format';

// Weekly completion as columns: the light bar is the hours planned for the week, the dark bar the hours done.
// One series, so no legend box; the subtitle names both marks. Hover or focus a week for exact numbers,
// or switch to the table, which carries every value.
const COLUMN = 24; // thin marks, capped
const SLOT = 34; // column plus air
const PLOT_HEIGHT = 200;
const ROUNDED_END = '4px 4px 0 0'; // rounded data end, square at the baseline

const describe = (week) => `Week ${week.index}, ${shortDate(week.startDate)} to ${shortDate(week.endDate)}: ${week.completedHours} of ${week.plannedHours} planned hours done`;

export default function WeeklyChart({ weekly }) {
  const [active, setActive] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const scroller = useRef(null);
  const currentIndex = weekly.findIndex((week) => week.state === 'current');
  const shown = weekly[active ?? (currentIndex >= 0 ? currentIndex : -1)] || null;
  const max = Math.max(1, ...weekly.map((week) => week.plannedHours));
  const ticks = [...new Set([0, Math.round(max / 2), max])];

  // Long plans scroll sideways; start with the current week in view.
  useEffect(() => {
    if (scroller.current && currentIndex >= 0) scroller.current.scrollLeft = Math.max(0, currentIndex * SLOT - scroller.current.clientWidth / 2);
  }, [currentIndex, asTable]);

  if (!weekly.length) return <p className="text-sm text-muted">There are no weeks left to chart.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm leading-6 text-muted">Dark bar: hours done. Light bar: hours planned for the week.</p>
        <button type="button" onClick={() => setAsTable((value) => !value)} className="control-transition inline-flex min-h-10 items-center gap-2 border border-pale bg-white px-3 text-xs font-extrabold text-ink hover:border-mid">
          {asTable ? <BarChart3 size={14} aria-hidden="true" /> : <Table2 size={14} aria-hidden="true" />} {asTable ? 'View as chart' : 'View as table'}
        </button>
      </div>

      {asTable ? (
        <div className="mt-4 max-h-[22rem] overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Weekly planned and completed hours</caption>
            <thead>
              <tr className="border-b border-[var(--rule)] font-mono text-[11px] uppercase tracking-[.1em] text-muted">
                <th className="py-2 pr-4 font-medium">Week</th>
                <th className="py-2 pr-4 font-medium">Dates</th>
                <th className="py-2 pr-4 text-right font-medium">Planned</th>
                <th className="py-2 pr-4 text-right font-medium">Done</th>
                <th className="py-2 pr-4 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">Logged</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((week) => (
                <tr key={week.index} className="border-b border-[var(--rule)]">
                  <td className="py-2 pr-4 font-bold text-ink">{week.index}{week.state === 'current' ? ' (now)' : ''}</td>
                  <td className="py-2 pr-4 text-muted">{shortDate(week.startDate)} – {shortDate(week.endDate)}</td>
                  <td className="py-2 pr-4 text-right">{week.plannedHours} h</td>
                  <td className="py-2 pr-4 text-right">{week.completedHours} h</td>
                  <td className="py-2 pr-4 text-right">{Math.round(week.completionRate * 100)}%</td>
                  <td className="py-2 text-right text-muted">{minutesLabel(week.minutesLogged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <p className="mt-4 min-h-6 text-sm text-ink" aria-live="polite">
            {shown
              ? <><span className="font-extrabold">Week {shown.index}</span> · {shortDate(shown.startDate)} – {shortDate(shown.endDate)} · <span className="font-bold">{shown.completedHours} of {shown.plannedHours} h done ({Math.round(shown.completionRate * 100)}%)</span>{shown.minutesLogged ? ` · ${minutesLabel(shown.minutesLogged)} logged` : ''}</>
              : 'Hover or focus a week for details.'}
          </p>
          <div className="mt-3 flex">
            <div className="relative shrink-0 font-mono text-[10px] text-muted" style={{ height: PLOT_HEIGHT, width: 34 }} aria-hidden="true">
              {ticks.map((tick) => <span key={tick} className="absolute right-2 translate-y-1/2" style={{ bottom: `${(tick / max) * 100}%` }}>{tick}h</span>)}
            </div>
            <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto pb-1" role="group" aria-label="Weekly progress chart">
              <div className="relative" style={{ height: PLOT_HEIGHT, width: weekly.length * SLOT }}>
                {ticks.map((tick) => <div key={tick} className="absolute inset-x-0 border-t border-[var(--rule)]" style={{ bottom: `${(tick / max) * 100}%` }} aria-hidden="true" />)}
                <div className="absolute inset-0 flex items-end">
                  {weekly.map((week, index) => {
                    const trackHeight = (week.plannedHours / max) * 100;
                    const fill = week.plannedHours > 0 ? (week.completedHours / week.plannedHours) * 100 : 0;
                    return (
                      <button
                        key={week.index} type="button" aria-label={describe(week)}
                        onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}
                        className="group relative flex h-full items-end justify-center outline-none" style={{ width: SLOT }}
                      >
                        <span className="relative block bg-pale/70 group-hover:bg-pale group-focus-visible:bg-pale" style={{ width: COLUMN, height: `${trackHeight}%`, borderRadius: ROUNDED_END }}>
                          <span className="absolute inset-x-0 bottom-0 block bg-mid" style={{ height: `${fill}%`, borderRadius: ROUNDED_END }} />
                        </span>
                        {week.state === 'current' && <span className="absolute inset-y-0 w-px bg-[var(--color-azure)] opacity-40" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex font-mono text-[10px] text-muted" style={{ width: weekly.length * SLOT }} aria-hidden="true">
                {weekly.map((week, index) => (
                  <span key={week.index} className={`text-center ${week.state === 'current' ? 'font-bold text-mid' : ''}`} style={{ width: SLOT }}>
                    {weekly.length <= 16 || index % 4 === 0 || week.state === 'current' ? week.index : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
