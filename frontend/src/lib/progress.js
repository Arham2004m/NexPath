// Small helpers for showing progress. The server is the source of truth; these only make the page feel instant.

// Immediately reflect a tick before the server answers (it replaces this with the real numbers, or we roll back).
export function withTopicDone(progress, topicId, done) {
  if (!progress) return progress;
  return {
    ...progress,
    topicStatus: { ...progress.topicStatus, [topicId]: done ? 'done' : 'upcoming' },
    topicsDone: Math.max(0, progress.topicsDone + (done ? 1 : -1))
  };
}

export const hoursLabel = (hours) => (Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`);

export function minutesLabel(minutes) {
  if (!minutes) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

// Plain-language pace, never alarming: the plan adapts, the student is not graded.
export function paceSummary(progress) {
  const weeks = Math.abs(progress.lagWeeks ?? 0).toFixed(1);
  switch (progress.pace) {
    case 'complete': return { label: 'Roadmap complete', detail: 'Every topic is done. Well finished.' };
    case 'not_started': return { label: 'Just getting started', detail: 'Your first week is not over yet, so there is no pace to measure.' };
    case 'behind': return { label: 'Behind schedule', detail: `About ${weeks} weeks of planned work are still open. A small push each day closes that gap.` };
    case 'ahead': return { label: 'Ahead of schedule', detail: `You are about ${weeks} weeks ahead of the plan.` };
    default: return { label: 'On track', detail: (progress.lagWeeks ?? 0) > 0.05 ? `A little over ${weeks} weeks of planned work is open, well within range.` : 'You are keeping up with the plan.' };
  }
}
