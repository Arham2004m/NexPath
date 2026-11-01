import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { newStudent, startDatabase, stopDatabase } from './helpers/api.js';
import { ageReplans, ageRoadmap, replanEvents, versions } from './helpers/time.js';

let app;
beforeAll(async () => { app = await startDatabase(); });
afterAll(async () => { await stopDatabase(); });

const goal = { goalId: 'ai_ml', hoursPerWeek: 10 };
const topicsOfWeek = (plan, n) => [...new Set(plan.weeks[n - 1].topics.map((t) => t.topicId))];
const allTopics = (plan) => [...new Set(plan.weeks.flatMap((w) => w.topics.map((t) => t.topicId)))];
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const utcToday = () => new Date().toISOString().slice(0, 10);

async function readyStudent(extra = {}) {
  const student = await newStudent(app);
  await student.takeAssessmentAsBeginner();
  await student.chooseGoal({ ...goal, ...extra });
  return student;
}
const current = async (student) => (await student.get('/roadmaps/current')).body;
const tick = (student, topicId, done = true) => student.patch(`/roadmaps/current/topics/${topicId}`, { done });

// A student who finished `count` topics straight away, then let `days` go by.
async function aheadStudent(count = 14, days = 8) {
  const student = await readyStudent();
  const { roadmap } = await current(student);
  for (const id of allTopics(roadmap.plan).slice(0, count)) await tick(student, id);
  await ageRoadmap(student.id, days);
  return student;
}

describe('falling behind', () => {
  it('replans when the student opens the app after weeks of nothing', async () => {
    const student = await readyStudent();
    const v1 = (await current(student)).roadmap;
    await ageRoadmap(student.id, 21);

    const { roadmap, progress, replan } = await current(student);
    expect(roadmap.version).toBe(2);
    expect(roadmap.plan.startDate).toBe(utcToday());
    expect(roadmap.plan.endDate > addDays(v1.plan.endDate, -21)).toBe(true);
    expect(roadmap.plan.totalHours).toBe(v1.plan.totalHours);
    expect(progress.pace).toBe('not_started'); // the new plan starts clean
    expect(replan.event).toMatchObject({ action: 'shift', fromVersion: 1, toVersion: 2 });
    expect(replan.event.message).toMatch(/behind schedule/);
    expect(replan.event.metrics).toMatchObject({ pace: 'behind', weeksEnded: 3, completedHours: 0 });
    expect(replan.event.details).toMatchObject({ oldEndDate: addDays(v1.plan.endDate, -21), newEndDate: roadmap.plan.endDate });
  });

  it('keeps every version, labels why it exists, and logs the replan', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    await current(student);
    const all = await versions(student.id);
    expect(all.map((v) => [v.version, v.status, v.cause])).toEqual([[1, 'superseded', 'inputs'], [2, 'active', 'shift']]);
    const events = await replanEvents(student.id);
    expect(events).toHaveLength(1);
    expect(String(events[0].fromRoadmapId)).toBe(String(all[0]._id));
    expect(String(events[0].toRoadmapId)).toBe(String(all[1]._id));
    expect(events[0].seenAt).toBeNull();
  });

  it('never moves or removes work the student finished', async () => {
    const student = await readyStudent();
    const v1 = (await current(student)).roadmap;
    const finished = topicsOfWeek(v1.plan, 1);
    for (const id of finished) await tick(student, id);
    await ageRoadmap(student.id, 28);
    const { roadmap, progress } = await current(student);
    expect(roadmap.version).toBe(2);
    const scheduled = new Set(allTopics(roadmap.plan));
    for (const id of finished) expect(scheduled.has(id), id).toBe(false);
    expect(roadmap.plan.completedTopics.map((t) => t.topicId).sort()).toEqual([...finished].sort());
    expect(progress.carriedHours).toBeGreaterThan(0);
    expect(progress.percentComplete).toBeGreaterThan(0);
    expect(roadmap.plan.totalHours + roadmap.plan.completedHours).toBe(v1.plan.totalHours);
  });

  it('does not replan again on the next visit, and the explanation stays until it is read', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    const first = await current(student);
    const second = await current(student);
    expect(second.roadmap.version).toBe(2);
    expect(second.roadmap.id).toBe(first.roadmap.id);
    expect(second.replan.event.id).toBe(first.replan.event.id);
    expect(await replanEvents(student.id)).toHaveLength(1);
  });

  it('is also triggered by ticking a topic, and says the plan changed', async () => {
    const student = await readyStudent();
    const v1 = (await current(student)).roadmap;
    await ageRoadmap(student.id, 21);
    const res = await tick(student, topicsOfWeek(v1.plan, 1)[0]);
    expect(res.status).toBe(200);
    expect(res.body.roadmapChanged).toBe(true);
    expect(res.body.replan.event.action).toBe('shift');
    expect((await versions(student.id)).length).toBe(2);
  });

  it('is also triggered by opening the progress page', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    const res = await student.get('/dashboard');
    expect(res.body.roadmap.version).toBe(2);
    expect(res.body.replan.event.action).toBe('shift');
    expect(res.body.replan.history).toHaveLength(1);
    expect(res.body.roadmap.plan).toBeUndefined();
  });

  it('does nothing before the first week is over, or when the student is keeping up', async () => {
    const student = await readyStudent();
    const v1 = (await current(student)).roadmap;
    await ageRoadmap(student.id, 3);
    expect((await current(student)).roadmap.version).toBe(1);
    for (const id of topicsOfWeek(v1.plan, 1)) await tick(student, id);
    await ageRoadmap(student.id, 5);
    const { roadmap, replan } = await current(student);
    expect(roadmap.version).toBe(1);
    expect(replan.event).toBeNull();
    expect(await replanEvents(student.id)).toHaveLength(0);
  });

  it('only one of several parallel requests replans', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    const answers = await Promise.all(Array.from({ length: 6 }, () => student.get('/roadmaps/current')));
    for (const res of answers) expect(res.status).toBe(200);
    expect(await replanEvents(student.id)).toHaveLength(1);
    const all = await versions(student.id);
    expect(all.filter((v) => v.status === 'active')).toHaveLength(1);
    expect(all).toHaveLength(2);
    // Whichever request answered, it showed a consistent plan.
    const versionsSeen = new Set(answers.map((res) => res.body.roadmap.version));
    expect([...versionsSeen].every((v) => v === 1 || v === 2)).toBe(true);
  });
});

describe('races', () => {
  it('twenty mixed requests at once produce exactly one replan and one active version', async () => {
    for (let round = 0; round < 3; round++) {
      const student = await readyStudent();
      const v1 = (await current(student)).roadmap;
      await ageRoadmap(student.id, 21);
      const topic = topicsOfWeek(v1.plan, 1)[0];
      const calls = Array.from({ length: 20 }, (_, i) => (i % 3 === 0 ? student.get('/dashboard') : i % 3 === 1 ? student.get('/roadmaps/current') : tick(student, topic)));
      const answers = await Promise.all(calls);
      for (const res of answers) expect(res.status, `round ${round}`).toBeLessThan(500);
      const all = await versions(student.id);
      expect(all.filter((v) => v.status === 'active'), `round ${round}`).toHaveLength(1);
      expect(all, `round ${round}`).toHaveLength(2);
      expect(await replanEvents(student.id), `round ${round}`).toHaveLength(1);
      expect(all[1].cause).toBe('shift');
    }
  });

  it('parallel requests after the student changes their hours create exactly one new version', async () => {
    const student = await readyStudent();
    await current(student);
    await student.chooseGoal({ ...goal, hoursPerWeek: 15 });
    const answers = await Promise.all(Array.from({ length: 8 }, () => student.get('/roadmaps/current')));
    for (const res of answers) expect(res.status).toBe(200);
    const all = await versions(student.id);
    expect(all).toHaveLength(2);
    expect(all.filter((v) => v.status === 'active')).toHaveLength(1);
    expect(all[1].plan.hoursPerWeek).toBe(15);
  });

  it('a student with no active roadmap (a crash mid-swap) is recovered instead of stuck', async () => {
    const student = await readyStudent();
    await current(student);
    await mongoose.model('Roadmap').updateMany({ userId: student.id }, { $set: { status: 'superseded' } });
    const res = await student.get('/roadmaps/current');
    expect(res.status).toBe(200);
    expect(res.body.roadmap.version).toBe(2);
    expect((await versions(student.id)).filter((v) => v.status === 'active')).toHaveLength(1);
  });
});

describe('the weekly guard', () => {
  it('blocks a second automatic replan for 7 days, then allows it', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    await current(student); // first shift
    await ageRoadmap(student.id, 21); // behind again, but the replan was moments ago
    expect((await current(student)).roadmap.version).toBe(2);
    await ageReplans(student.id, 8);
    expect((await current(student)).roadmap.version).toBe(3);
    expect(await replanEvents(student.id)).toHaveLength(2);
  });

  it('is not started by changes the student makes themselves', async () => {
    const student = await readyStudent();
    await current(student);
    await student.chooseGoal({ ...goal, hoursPerWeek: 15 });
    expect((await current(student)).roadmap.version).toBe(2);
    expect(await replanEvents(student.id)).toHaveLength(0);
    await ageRoadmap(student.id, 21);
    expect((await current(student)).roadmap.version).toBe(3); // the guard did not treat the edit as a replan
  });
});

describe('getting ahead', () => {
  it('adds optional extras without changing the schedule, the finish date or the percentage', async () => {
    const student = await aheadStudent();
    const before = (await versions(student.id))[0].plan;
    const { roadmap, progress, replan } = await current(student);
    expect(roadmap.version).toBe(2);
    expect(replan.event).toMatchObject({ action: 'enrich', fromVersion: 1, toVersion: 2 });
    expect(replan.event.message).toMatch(/ahead of schedule/);
    expect(roadmap.plan.weeks).toEqual(before.weeks);
    expect(roadmap.plan.endDate).toBe(before.endDate);
    expect(roadmap.plan.extras.topics.length).toBeGreaterThan(0);
    expect(progress.extras).toMatchObject({ total: roadmap.plan.extras.topics.length, done: 0 });
    expect(progress.topicsTotal).toBe(allTopics(before).length);
    expect((await versions(student.id))[1].cause).toBe('enrich');
  });

  it('extras can be ticked, un-ticked and timed, and never move the percentage', async () => {
    const student = await aheadStudent();
    const { roadmap, progress: before } = await current(student);
    const extra = roadmap.plan.extras.topics[0].topicId;
    const ticked = await tick(student, extra);
    expect(ticked.status).toBe(200);
    expect(ticked.body.progress.extras.done).toBe(1);
    expect(ticked.body.progress.topicStatus[extra]).toBe('done');
    expect(ticked.body.progress.percentComplete).toBe(before.percentComplete);
    expect(ticked.body.progress.topicsDone).toBe(before.topicsDone);
    const timed = await student.patch(`/roadmaps/current/topics/${extra}`, { minutesSpent: 30 });
    expect(timed.body.progress.minutesByTopic[extra]).toBe(30);
    expect((await tick(student, extra, false)).body.progress.extras.done).toBe(0);
  });

  it('only the owner can tick their extras', async () => {
    const student = await aheadStudent();
    const extra = (await current(student)).roadmap.plan.extras.topics[0].topicId;
    const other = await readyStudent({ goalId: 'mobile_dev', subTrack: 'flutter' });
    expect((await tick(other, extra)).status).toBe(404);
  });

  it('adds nothing more while the first batch is still undone, and cannot pile up', async () => {
    const student = await aheadStudent();
    await current(student);
    await ageReplans(student.id, 8);
    const again = await current(student);
    expect(again.roadmap.version).toBe(2);
    expect(await replanEvents(student.id)).toHaveLength(1);
  });

  it('a regeneration caused by the student starts without extras (they depend on the pace at that moment)', async () => {
    const student = await aheadStudent();
    expect((await current(student)).roadmap.plan.extras).toBeTruthy();
    await student.chooseGoal({ ...goal, hoursPerWeek: 12 });
    const { roadmap } = await current(student);
    expect(roadmap.version).toBe(3);
    expect(roadmap.plan.extras).toBeUndefined();
  });
});

describe('deadlines', () => {
  it('keeps the date the student set and shrinks the weeks left', async () => {
    const student = await readyStudent({ targetWeeks: 12 });
    const v1 = (await current(student)).roadmap;
    expect(v1.plan.deadlineDate).toBe(addDays(v1.plan.startDate, 84));
    await ageRoadmap(student.id, 21);
    const { roadmap, replan } = await current(student);
    expect(roadmap.plan.deadlineDate).toBe(addDays(v1.plan.startDate, 84 - 21));
    expect(roadmap.plan.targetWeeks).toBe(Math.floor(63 / 7));
    expect(replan.event.details.deadline).toMatchObject({ date: roadmap.plan.deadlineDate, passed: false });
  });

  it('reports a deadline that has passed instead of a nonsense target', async () => {
    const student = await readyStudent({ targetWeeks: 4 });
    await current(student);
    await ageRoadmap(student.id, 60);
    const { roadmap, replan } = await current(student);
    expect(roadmap.plan.targetWeeks).toBeNull();
    expect(roadmap.plan.deadlineDate).toBeNull();
    expect(replan.event.details.deadline.passed).toBe(true);
    expect(replan.event.message).toMatch(/has passed/);
  });
});

describe('roadmaps saved before replanning existed', () => {
  it('still replan correctly: no deadline date or extras stored, and the deadline is worked out from the target', async () => {
    const student = await readyStudent({ targetWeeks: 12 });
    const v1 = (await current(student)).roadmap;
    // Make the stored plan look like one from an earlier release.
    const Roadmap = mongoose.model('Roadmap');
    const doc = await Roadmap.findOne({ userId: student.id, status: 'active' }).lean();
    const legacy = { ...doc.plan };
    delete legacy.deadlineDate;
    delete legacy.extras;
    await Roadmap.collection.updateOne({ _id: doc._id }, { $set: { plan: legacy } });
    await ageRoadmap(student.id, 21);

    const { roadmap, progress, replan } = await current(student);
    expect(replan.event.action).toBe('shift');
    expect(roadmap.plan.deadlineDate).toBe(addDays(v1.plan.startDate, 84 - 21));
    expect(progress.extras).toMatchObject({ total: 0, done: 0, topics: [] });
  });

  it('progress for a plan without extras reports none', async () => {
    const student = await readyStudent();
    expect((await current(student)).progress.extras).toEqual({ total: 0, done: 0, hours: 0, doneHours: 0, topics: [], nodes: {} });
  });
});

describe('offering fewer hours', () => {
  it('offers it after three slow weeks, keeps the offer with the banner, and applies it only when accepted', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    const { replan, roadmap } = await current(student);
    expect(replan.suggestion).toMatchObject({ hoursPerWeek: 5, currentHoursPerWeek: 10 });
    expect(roadmap.plan.hoursPerWeek).toBe(10); // never changed silently
    expect((await student.get('/auth/me')).body.user.hoursPerWeek).toBe(10);

    const accepted = await student.post('/replans/accept-hours', { hoursPerWeek: 5 });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user.hoursPerWeek).toBe(5);
    const after = await current(student);
    expect(after.roadmap.plan.hoursPerWeek).toBe(5);
    expect(after.roadmap.version).toBe(3);
    expect(after.replan.event).toBeNull(); // accepting counts as having read the banner
  });

  it('is still offered while a recent replan blocks another one', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    await current(student); // shift
    await ageRoadmap(student.id, 21); // three slow weeks again
    const { replan, roadmap } = await current(student);
    expect(roadmap.version).toBe(2);
    expect(replan.suggestion).toMatchObject({ currentHoursPerWeek: 10 });
  });

  it('only ever lowers the hours and validates the number', async () => {
    const student = await readyStudent();
    await current(student);
    for (const hoursPerWeek of [10, 12, 2, 41, 4.5, '5', null, undefined, -3]) {
      const res = await student.post('/replans/accept-hours', { hoursPerWeek });
      expect(res.status, String(hoursPerWeek)).toBe(400);
    }
    expect((await student.get('/auth/me')).body.user.hoursPerWeek).toBe(10);
    const stranger = await newStudent(app);
    expect((await stranger.post('/replans/accept-hours', { hoursPerWeek: 5 })).status).toBe(400);
  });
});

describe('history and read receipts', () => {
  it('lists a student\'s own replans, newest first, and lets them mark one as read', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    const { replan } = await current(student);
    const list = (await student.get('/replans')).body.events;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(replan.event.id);

    const seen = await student.patch(`/replans/${replan.event.id}/seen`, {});
    expect(seen.status).toBe(200);
    expect(seen.body.event.seenAt).toBeTruthy();
    expect((await current(student)).replan.event).toBeNull();
    expect((await student.get('/replans')).body.events).toHaveLength(1); // still in the history
  });

  it('keeps other students out and rejects bad ids', async () => {
    const owner = await readyStudent();
    await current(owner);
    await ageRoadmap(owner.id, 21);
    const { replan } = await current(owner);
    const other = await readyStudent();
    expect((await other.patch(`/replans/${replan.event.id}/seen`, {})).status).toBe(404);
    expect((await other.get('/replans')).body.events).toEqual([]);
    for (const id of ['not-an-id', '123', '%00', 'x'.repeat(200)]) expect((await owner.patch(`/replans/${id}/seen`, {})).status, id).toBe(404);
    expect((await owner.patch(`/replans/${replan.event.id}/seen`, {})).status).toBe(200);
  });

  it('needs a login', async () => {
    for (const [method, path] of [['get', '/api/replans'], ['patch', '/api/replans/x/seen'], ['post', '/api/replans/accept-hours'], ['post', '/api/roadmaps/replan']]) {
      expect((await request(app)[method](path).send({})).status, path).toBe(401);
    }
  });

  it('an unread explanation fades after two weeks', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    expect((await current(student)).replan.event).toBeTruthy();
    await mongoose.model('ReplanEvent').collection.updateMany({ userId: new mongoose.Types.ObjectId(student.id) }, { $set: { createdAt: new Date(Date.now() - 15 * 86_400_000) } });
    expect((await current(student)).replan.event).toBeNull();
  });
});

describe('asking for a check right now', () => {
  const replanNow = (student) => student.post('/roadmaps/replan', {});

  it('explains that nothing needs to change when the student is on track', async () => {
    const student = await readyStudent();
    const v1 = (await current(student)).roadmap;
    for (const id of topicsOfWeek(v1.plan, 1)) await tick(student, id);
    await ageRoadmap(student.id, 8);
    const res = await replanNow(student);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ replanned: false });
    expect(res.body.message).toMatch(/keeping up/);
    expect(res.body.roadmap.version).toBe(1);
  });

  it('says so before the first week is over', async () => {
    const student = await readyStudent();
    await current(student);
    const res = await replanNow(student);
    expect(res.body.replanned).toBe(false);
    expect(res.body.message).toMatch(/first week is not over/);
  });

  it('replans a student who is behind, with the same explanation as an automatic one', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    const res = await replanNow(student);
    expect(res.body.replanned).toBe(true);
    expect(res.body.message).toMatch(/behind schedule/);
    expect(res.body.roadmap.version).toBe(2);
    expect(res.body.replan.event.id).toBeTruthy();
  });

  it('skips the 7 day wait but never the thresholds', async () => {
    const student = await readyStudent();
    await current(student);
    await ageRoadmap(student.id, 21);
    await current(student); // automatic shift
    await ageRoadmap(student.id, 21); // behind again straight away
    expect((await current(student)).roadmap.version).toBe(2); // the automatic guard holds
    const manual = await replanNow(student);
    expect(manual.body.replanned).toBe(true);
    expect(manual.body.roadmap.version).toBe(3);

    const calm = await readyStudent();
    await current(calm);
    await ageRoadmap(calm.id, 10); // a week and a bit in, one week behind: not enough
    const none = await replanNow(calm);
    expect(none.body.replanned).toBe(false);
    expect(none.body.roadmap.version).toBe(1);
  });

  it('refuses to add extras when none are unlocked, and says why', async () => {
    const student = await readyStudent({ goalId: 'faang' });
    const v1 = (await current(student)).roadmap;
    const early = v1.plan.nodes.filter((n) => ['prog-basics', 'dsa-arrays', 'dsa-linear', 'dsa-sorting-search'].includes(n.id)).flatMap((n) => n.topics.map((t) => t.id));
    for (const id of early) await tick(student, id);
    await ageRoadmap(student.id, 8);
    const res = await replanNow(student);
    expect(res.body.replanned).toBe(false);
    expect(res.body.message).toMatch(/no optional topics are unlocked/);
  });
});
