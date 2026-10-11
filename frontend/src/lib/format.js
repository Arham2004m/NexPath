const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dateWithYear = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Dates arrive as YYYY-MM-DD; parse as UTC so the day never shifts with the viewer's timezone.
const parse = (iso) => new Date(`${iso}T00:00:00Z`);
export const shortDate = (iso) => date.format(parse(iso));
export const longDate = (iso) => dateWithYear.format(parse(iso));
export const weekRange = (node) => (node.startWeek === node.endWeek ? `Week ${node.startWeek}` : `Weeks ${node.startWeek}–${node.endWeek}`);
