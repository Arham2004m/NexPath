// Demo data for presentations: two students with five weeks of history, so every screen has something real to show.
//   Riya Sharma  (demo.ontrack@nexpath.dev): Web Developer (Full Stack), keeping up with the plan.
//   Karan Mehta  (demo.behind@nexpath.dev):  Product Company Placement, well behind. The first time the app loads for him, the adaptive
//                                            replanner reschedules his plan and shows the explanation banner.
// Safe to run again: it removes the two demo accounts (and only those) and recreates them.   `npm run seed-demo`
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import ChatMessage from '../models/ChatMessage.js';
import IssuedQuestions from '../models/IssuedQuestions.js';
import ProgressEvent from '../models/ProgressEvent.js';
import ReplanEvent from '../models/ReplanEvent.js';
import Roadmap from '../models/Roadmap.js';
import User from '../models/User.js';
import { DOMAIN_LABELS } from '../data/domains.js';
import { activeRoadmap } from '../services/roadmapService.js';

export const DEMO_PASSWORD = 'Demo1234x';
const DAY_MS = 86_400_000;
const WEEKS_OF_HISTORY = 5;

export const DEMO_STUDENTS = [
  {
    key: 'ontrack', name: 'Riya Sharma', email: 'demo.ontrack@nexpath.dev', goalId: 'web_dev', subTrack: 'fullstack', hoursPerWeek: 10,
    bands: { prog: 'Intermediate', dsa: 'Beginner', os: 'Beginner', dbms: 'Beginner', web: 'Beginner', aiml: 'Beginner', cn: 'Beginner', sd: 'Beginner', mobile: 'Beginner' },
    progress: 'on_track'
  },
  {
    key: 'behind', name: 'Karan Mehta', email: 'demo.behind@nexpath.dev', goalId: 'faang', subTrack: null, hoursPerWeek: 8,
    bands: { prog: 'Intermediate', dsa: 'Beginner', os: 'Beginner', dbms: 'Intermediate', web: 'Beginner', aiml: 'Beginner', cn: 'Beginner', sd: 'Beginner', mobile: 'Beginner' },
    progress: 'behind'
  }
];

const dayString = (date) => date.toISOString().slice(0, 10);
const addDays = (day, days) => dayString(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));

async function removeDemoAccounts() {
  const users = await User.find({ email: { $in: DEMO_STUDENTS.map((s) => s.email) } }).select('_id');
  const ids = users.map((u) => u._id);
  if (!ids.length) return;
  for (const model of [AssessmentAttempt, ChatMessage, IssuedQuestions, ProgressEvent, ReplanEvent, Roadmap]) await model.deleteMany({ userId: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
}

// Which topics the student finished, and on which day. `on_track` keeps pace with every week that has ended and has
// started the current one; `behind` did a little in the first two weeks and then stopped.
function completions(plan, today, kind) {
  const order = [];
  for (const week of plan.weeks) {
    for (const entry of week.topics) {
      const known = order.find((t) => t.topicId === entry.topicId);
      if (known) { known.lastWeek = week; known.hours += entry.hours; } else order.push({ topicId: entry.topicId, hours: entry.hours, lastWeek: week });
    }
  }
  const ended = order.filter((t) => t.lastWeek.endDate < today);
  const current = order.find((t) => t.lastWeek.startDate <= today && t.lastWeek.endDate >= today);
  const picked = kind === 'on_track'
    ? [...ended, ...(current ? [current] : [])]
    : ended.slice(0, Math.max(1, Math.floor(ended.length * 0.3)));
  return picked.map((topic, index) => {
    // Spread finishing days through the week the topic was planned for (never in the future).
    const planned = kind === 'on_track' ? topic.lastWeek.startDate : plan.weeks[Math.min(index, 1)].startDate;
    const day = addDays(planned, 1 + (index % 5));
    return { ...topic, day: day > today ? today : day };
  });
}

export async function seedDemo({ today = dayString(new Date()), log = () => {} } = {}) {
  await removeDemoAccounts();
  const startDay = addDays(today, -7 * WEEKS_OF_HISTORY);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const created = [];

  for (const student of DEMO_STUDENTS) {
    const user = await User.create({
      name: student.name, email: student.email, passwordHash, goalId: student.goalId, subTrack: student.subTrack,
      hoursPerWeek: student.hoursPerWeek, onboardingComplete: true
    });
    const profile = Object.fromEntries(Object.entries(student.bands).map(([key, band]) => [key, { label: DOMAIN_LABELS[key], band, assessmentMethod: 'tested' }]));
    await AssessmentAttempt.create({ userId: user._id, profile, results: {}, timing: { limitSeconds: 1500, durationSeconds: 1210, timedOut: false } });

    // The roadmap starts five weeks ago, as if the student had been following it since then.
    const roadmap = await activeRoadmap(user._id, { today: startDay });
    const done = completions(roadmap.plan, today, student.progress);
    const events = done.flatMap((topic) => {
      const at = new Date(`${topic.day}T12:00:00Z`);
      return [
        { userId: user._id, roadmapId: roadmap._id, topicId: topic.topicId, type: 'time_logged', minutes: Math.round(topic.hours * 60 * 1.1), at, day: topic.day },
        { userId: user._id, roadmapId: roadmap._id, topicId: topic.topicId, type: 'complete', at: new Date(at.getTime() + 60_000), day: topic.day }
      ];
    });
    if (events.length) await ProgressEvent.insertMany(events);
    created.push({ ...student, userId: user._id, topicsDone: done.length });
    log(`${student.name} <${student.email}>: ${done.length} topics done`);
  }
  return created;
}

// `npm run seed-demo`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await import('dotenv/config');
  const { connectDatabase, disconnectDatabase } = await import('../config/db.js');
  try {
    await connectDatabase();
    await seedDemo({ log: console.log });
    console.log(`\nDemo accounts are ready. Password for both: ${DEMO_PASSWORD}`);
  } finally { await disconnectDatabase(); }
}
