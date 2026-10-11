const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dateWithYear = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Dates arrive as YYYY-MM-DD; parse as UTC so the day never shifts with the viewer's timezone.
const parse = (iso) => new Date(`${iso}T00:00:00Z`);
export const shortDate = (iso) => date.format(parse(iso));
export const longDate = (iso) => dateWithYear.format(parse(iso));
export const weekRange = (node) => (node.startWeek === node.endWeek ? `Week ${node.startWeek}` : `Weeks ${node.startWeek}–${node.endWeek}`);

const REFERENCE_HOURS = 10;
export const approxWeeks = (hours, perWeek = REFERENCE_HOURS) => Math.max(1, Math.ceil(hours / perWeek));

// "≈ 100 h · about 10 weeks at 10 h/week", or a range such as "≈ 100–250 h" for goals with sub-tracks.
export function effortLabel(estimatedHours) {
  if (estimatedHours == null) return null;
  if (Array.isArray(estimatedHours)) {
    const [low, high] = estimatedHours;
    return low === high ? effortLabel(low) : `≈ ${low}–${high} h depending on track`;
  }
  return `≈ ${estimatedHours} h · about ${approxWeeks(estimatedHours)} weeks at ${REFERENCE_HOURS} h/week`;
}
