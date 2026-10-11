// Turns an assessment profile into the set of skill nodes the student can skip.
// Beginner -> nothing; Intermediate -> level-1 nodes of the domain; Advanced -> level 1 and 2.
// Level-3 nodes are never skipped by the assessment alone. Self-reported domains prove nothing.
//
// Nodes can carry `tracks` (e.g. mobile stacks); they are only credited when the student's sub-track matches,
// because the mobile questions cannot tell Android from Flutter from iOS knowledge.

const MAX_LEVEL = { Beginner: 0, Intermediate: 1, Advanced: 2 };

export function masteredNodeIds(nodes, profile = {}, subTrack = null) {
  const mastered = [];
  for (const node of nodes) {
    const entry = profile[node.domain];
    if (!entry || entry.assessmentMethod !== 'tested') continue;
    if (node.level > (MAX_LEVEL[entry.band] ?? 0)) continue;
    if (node.tracks && !(subTrack && node.tracks.includes(subTrack))) continue;
    mastered.push(node.id);
  }
  return mastered.sort();
}
