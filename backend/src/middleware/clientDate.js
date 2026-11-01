// The student's own calendar day, so "this week" and "overdue" follow their clock, not UTC (in India the UTC date is
// still yesterday until 05:30). The browser sends it as X-Client-Date; anything implausible falls back to the UTC date.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function clientDate(req, res, next) {
  const utc = new Date().toISOString().slice(0, 10);
  const sent = req.get('x-client-date');
  const parsed = sent && DAY.test(sent) ? Date.parse(sent) : NaN;
  // Time zones span UTC-12 to UTC+14, so a real local date is never more than one day from the UTC date.
  req.today = !Number.isNaN(parsed) && Math.abs(parsed - Date.parse(utc)) <= DAY_MS ? sent : utc;
  next();
}
