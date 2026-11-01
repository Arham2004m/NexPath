// Lets a test make weeks "pass": the saved roadmap and its replan log are moved back in time in the database
// (the API itself only ever uses the real clock).
import mongoose from 'mongoose';

const DAY_MS = 86_400_000;
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// Moves the active roadmap `days` into the past, as if the student had started that long ago.
export async function ageRoadmap(userId, days) {
  const Roadmap = mongoose.model('Roadmap');
  const doc = await Roadmap.findOne({ userId, status: 'active' }).lean();
  const earlier = (iso) => (iso ? addDays(iso, -days) : iso);
  const plan = {
    ...doc.plan, startDate: earlier(doc.plan.startDate), endDate: earlier(doc.plan.endDate), deadlineDate: earlier(doc.plan.deadlineDate ?? null),
    weeks: doc.plan.weeks.map((week) => ({ ...week, startDate: earlier(week.startDate), endDate: earlier(week.endDate) }))
  };
  // The native driver, because Mongoose treats createdAt as immutable.
  await Roadmap.collection.updateOne({ _id: doc._id }, { $set: { plan, createdAt: new Date(doc.createdAt.getTime() - days * DAY_MS) } });
}

// Makes every replan of this student look `days` old (the 7 day cooldown counts from there).
export async function ageReplans(userId, days) {
  const ReplanEvent = mongoose.model('ReplanEvent');
  await ReplanEvent.collection.updateMany({ userId: new mongoose.Types.ObjectId(userId) }, { $set: { createdAt: new Date(Date.now() - days * DAY_MS) } });
}

export const replanEvents = (userId) => mongoose.model('ReplanEvent').find({ userId }).sort({ createdAt: 1 }).lean();
export const versions = (userId) => mongoose.model('Roadmap').find({ userId }).sort({ version: 1 }).lean();
