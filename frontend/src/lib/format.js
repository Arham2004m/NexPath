const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dateWithYear = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Dates arrive as YYYY-MM-DD; parse as UTC so the day never shifts with the viewer's timezone.
const parse = (iso) => new Date(`${iso}T00:00:00Z`);
export const shortDate = (iso) => date.format(parse(iso));
export const longDate = (iso) => dateWithYear.format(parse(iso));
export const weekRange = (node) => (node.startWeek === node.endWeek ? `Week ${node.startWeek}` : `Weeks ${node.startWeek}–${node.endWeek}`);

const REFERENCE_HOURS = 10;

// Real weeks from the server (it re-plans at every weekly load), for a goal or sub-track at `hours` h/week.
// For a goal whose sub-track is not chosen yet this is a range across its sub-tracks, e.g. "7–26".
export function weeksFor(entity, hours, subTrackId = null) {
  if (!entity) return null;
  const sources = entity.subTracks ? (subTrackId ? entity.subTracks.filter((t) => t.id === subTrackId) : entity.subTracks) : [entity];
  const values = sources.map((source) => source.weeksByHours?.[hours]).filter((value) => value != null);
  if (!values.length) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? String(low) : `${low}–${high}`;
}

// "≈ 100 h · about 10 weeks at 10 h/week", or "≈ 100–250 h depending on track" for goals with sub-tracks.
export function effortLabel(entity) {
  if (!entity || entity.estimatedHours == null) return null;
  if (Array.isArray(entity.estimatedHours)) {
    const [low, high] = entity.estimatedHours;
    return low === high ? `≈ ${low} h` : `≈ ${low}–${high} h depending on track`;
  }
  const weeks = weeksFor(entity, REFERENCE_HOURS);
  return `≈ ${entity.estimatedHours} h${weeks ? ` · about ${weeks} weeks at ${REFERENCE_HOURS} h/week` : ''}`;
}
