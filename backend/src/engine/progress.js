// Progress and learning velocity from a saved roadmap plus an append-only list of progress events.
// Pure: no database, clock or HTTP. The adaptive replanner reads these same numbers later.
//
// Definitions (handoff section 7.3), measured over the current roadmap version:
//   P = planned hours in weeks that have fully ended
//   C = hours of the topics marked complete
//   velocity = C / P (undefined until one week has ended)
//   lagWeeks = (P - C) / hoursPerWeek (positive = behind, negative = ahead)

const round = (value, places = 2) => Number(value.toFixed(places));
export const LAG_BEHIND_WEEKS = 2; // replanning threshold from the spec: 2+ weeks behind
export const LAG_AHEAD_WEEKS = -1; // one week or more ahead of schedule

// Events -> which topics are done and how many minutes were logged per topic.
export function reduceEvents(events = []) {
  const done = new Map();
  const minutes = new Map();
  const ordered = events.map((event, index) => ({ event, index })).sort((a, b) => new Date(a.event.at) - new Date(b.event.at) || a.index - b.index);
  for (const { event } of ordered) {
    if (event.type === 'complete') done.set(event.topicId, event.at);
    else if (event.type === 'uncomplete') done.delete(event.topicId);
    else if (event.type === 'time_logged') minutes.set(event.topicId, (minutes.get(event.topicId) || 0) + (event.minutes || 0));
  }
  return { done, minutes };
}

const isoDay = (value) => new Date(value).toISOString().slice(0, 10);

export function computeProgress({ plan, events = [], now = new Date() }) {
  const today = isoDay(now);
  const weeks = plan.weeks || [];
  const carried = plan.completedTopics || [];
  const carriedHours = carried.reduce((sum, topic) => sum + topic.hours, 0);

  // One entry per topic (a long topic can span several weeks).
  const topics = new Map();
  for (const week of weeks) {
    for (const entry of week.topics) {
      const known = topics.get(entry.topicId) || { topicId: entry.topicId, nodeId: entry.nodeId, nodeName: entry.nodeName, title: entry.title, hours: 0, firstWeek: week.index, lastWeek: week.index };
      known.hours += entry.hours;
      known.lastWeek = week.index;
      topics.set(entry.topicId, known);
    }
  }

  const { done, minutes } = reduceEvents(events);
  const doneIds = new Set([...done.keys()].filter((id) => topics.has(id)));
  const weekState = (week) => (week.endDate < today ? 'ended' : week.startDate <= today ? 'current' : 'upcoming');

  const endedWeeks = weeks.filter((week) => weekState(week) === 'ended');
  const P = endedWeeks.reduce((sum, week) => sum + week.plannedHours, 0);
  const C = [...doneIds].reduce((sum, id) => sum + topics.get(id).hours, 0);
  const velocity = endedWeeks.length && P > 0 ? round(C / P) : null;
  const lagWeeks = endedWeeks.length ? round((P - C) / plan.hoursPerWeek) : null;

  const statusOf = (topic) => {
    if (doneIds.has(topic.topicId)) return 'done';
    const last = weeks[topic.lastWeek - 1];
    if (last && weekState(last) === 'ended') return 'overdue';
    const first = weeks[topic.firstWeek - 1];
    if (first && weekState(first) !== 'upcoming') return 'current';
    return weekState(last) === 'current' ? 'current' : 'upcoming';
  };
  const topicStatus = {};
  for (const topic of topics.values()) topicStatus[topic.topicId] = statusOf(topic);

  // Logged minutes by calendar week (events before the start or after the end land in the first or last week).
  const minutesByWeek = new Map(weeks.map((week) => [week.index, 0]));
  for (const event of events) {
    if (event.type !== 'time_logged' || !topics.has(event.topicId) || !weeks.length) continue;
    const day = isoDay(event.at);
    const week = weeks.find((w) => day >= w.startDate && day <= w.endDate) || (day < weeks[0].startDate ? weeks[0] : weeks[weeks.length - 1]);
    minutesByWeek.set(week.index, minutesByWeek.get(week.index) + (event.minutes || 0));
  }

  const weekly = weeks.map((week) => {
    const completedHours = week.topics.filter((entry) => doneIds.has(entry.topicId)).reduce((sum, entry) => sum + entry.hours, 0);
    return {
      index: week.index, startDate: week.startDate, endDate: week.endDate, state: weekState(week),
      plannedHours: week.plannedHours, completedHours,
      completionRate: week.plannedHours > 0 ? round(completedHours / week.plannedHours) : 1,
      minutesLogged: minutesByWeek.get(week.index)
    };
  });

  const loggedMinutes = [...minutes].filter(([id]) => topics.has(id)).reduce((sum, [, value]) => sum + value, 0);
  const plannedToDate = weeks.filter((week) => weekState(week) !== 'upcoming').reduce((sum, week) => sum + week.plannedHours, 0);

  const totalHours = carriedHours + (plan.totalHours || 0);
  const doneHours = carriedHours + C;
  const currentWeek = weeks.find((week) => weekState(week) === 'current');

  const nodes = {};
  for (const topic of topics.values()) {
    const entry = nodes[topic.nodeId] || (nodes[topic.nodeId] = { done: 0, total: 0 });
    entry.total += 1;
    if (doneIds.has(topic.topicId)) entry.done += 1;
  }
  for (const entry of Object.values(nodes)) entry.complete = entry.done === entry.total;

  const nextUp = [...topics.values()]
    .filter((topic) => !doneIds.has(topic.topicId))
    .sort((a, b) => a.firstWeek - b.firstWeek)
    .slice(0, 6)
    .map((topic) => ({ topicId: topic.topicId, nodeId: topic.nodeId, nodeName: topic.nodeName, title: topic.title, hours: topic.hours, week: topic.firstWeek, overdue: topicStatus[topic.topicId] === 'overdue' }));

  const finished = topics.size === doneIds.size;
  const pace = finished ? 'complete'
    : lagWeeks === null ? 'not_started'
      : lagWeeks >= LAG_BEHIND_WEEKS ? 'behind'
        : lagWeeks <= LAG_AHEAD_WEEKS ? 'ahead' : 'on_track';

  return {
    percentComplete: totalHours > 0 ? Math.round((100 * doneHours) / totalHours) : 100,
    doneHours, totalHours, carriedHours,
    topicsDone: doneIds.size, topicsTotal: topics.size,
    currentWeek: currentWeek ? currentWeek.index : (weeks.length && today > weeks[weeks.length - 1].endDate ? weeks.length : 1),
    weeksEnded: endedWeeks.length, totalWeeks: weeks.length,
    plannedHoursToDate: plannedToDate, loggedHours: round(loggedMinutes / 60),
    velocity, lagWeeks, pace,
    topicStatus, minutesByTopic: Object.fromEntries([...minutes].filter(([id]) => topics.has(id))),
    nodes, weekly, nextUp
  };
}

// The completed topic ids that a regenerated plan must keep as finished work.
export const completedTopicIdsFrom = (events) => [...reduceEvents(events).done.keys()];
