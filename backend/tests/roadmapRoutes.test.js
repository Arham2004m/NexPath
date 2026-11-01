import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { newStudent, startDatabase, stopDatabase } from './helpers/api.js';

let app;
beforeAll(async () => { app = await startDatabase(); });
afterAll(async () => { await stopDatabase(); });

const frontend = { goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10 };
const firstTopicOf = (plan) => plan.weeks[0].topics[0].topicId;

async function readyStudent(goal = frontend) {
  const student = await newStudent(app);
  await student.takeAssessmentAsBeginner();
  await student.chooseGoal(goal);
  return student;
}

describe('access control', () => {
  it('rejects every roadmap route without a login', async () => {
    for (const [method, path] of [['get', '/roadmaps/current'], ['post', '/roadmaps/regenerate'], ['patch', '/roadmaps/current/topics/x'], ['get', '/dashboard'], ['post', '/roadmaps/preview'], ['put', '/me/known-skills']]) {
      const res = await request(app)[method](`/api${path}`).send({});
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('asks for a goal, then an assessment, before making a roadmap', async () => {
    const student = await newStudent(app);
    const noGoal = await student.get('/roadmaps/current');
    expect(noGoal.status).toBe(400);
    expect(noGoal.body.code).toBe('GOAL_REQUIRED');
    await student.chooseGoal(frontend);
    const noAssessment = await student.get('/roadmaps/current');
    expect(noAssessment.body.code).toBe('ASSESSMENT_REQUIRED');
  });

  it('one student cannot read or change another students roadmap', async () => {
    const alice = await readyStudent();
    const bob = await readyStudent();
    const aliceMap = (await alice.get('/roadmaps/current')).body.roadmap;
    const bobMap = (await bob.get('/roadmaps/current')).body.roadmap;
    expect(aliceMap.id).not.toBe(bobMap.id);
    // Bob ticks a topic: it only ever changes Bobs own progress.
    const topicId = firstTopicOf(aliceMap.plan);
    await bob.patch(`/roadmaps/current/topics/${topicId}`, { done: true });
    expect((await alice.get('/roadmaps/current')).body.progress.topicsDone).toBe(0);
    expect((await bob.get('/roadmaps/current')).body.progress.topicsDone).toBe(1);
    // A topic that is not in the students own plan is refused.
    const mobile = await readyStudent({ goalId: 'mobile_dev', subTrack: 'flutter', hoursPerWeek: 10 });
    const foreign = await mobile.patch(`/roadmaps/current/topics/${topicId}`, { done: true });
    expect(foreign.status).toBe(404);
    expect((await mobile.get('/roadmaps/current')).body.progress.topicsDone).toBe(0);
  });
});

describe('saved roadmap', () => {
  it('creates version 1 once and returns the same roadmap on every visit', async () => {
    const student = await readyStudent();
    const first = (await student.get('/roadmaps/current')).body.roadmap;
    const second = (await student.get('/roadmaps/current')).body.roadmap;
    expect(first.version).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.plan.startDate).toBe(first.plan.startDate);
    expect(await mongoose.model('Roadmap').countDocuments({ userId: student.id })).toBe(1);
  });

  it('makes a new version when hours change and supersedes the old one', async () => {
    const student = await readyStudent();
    const v1 = (await student.get('/roadmaps/current')).body.roadmap;
    await student.chooseGoal({ ...frontend, hoursPerWeek: 20 });
    const v2 = (await student.get('/roadmaps/current')).body.roadmap;
    expect(v2.version).toBe(2);
    expect(v2.plan.totalWeeks).toBeLessThan(v1.plan.totalWeeks);
    const all = await mongoose.model('Roadmap').find({ userId: student.id }).lean();
    expect(all.filter((r) => r.status === 'active')).toHaveLength(1);
    expect(all.find((r) => r.version === 1).status).toBe('superseded');
  });

  it('makes a new version when a skill is marked known', async () => {
    const student = await readyStudent();
    const v1 = (await student.get('/roadmaps/current')).body.roadmap;
    expect((await student.put('/me/known-skills', { nodeId: 'web-js', known: true })).status).toBe(200);
    const v2 = (await student.get('/roadmaps/current')).body.roadmap;
    expect(v2.version).toBe(2);
    expect(v2.plan.nodes.find((n) => n.id === 'web-js').status).toBe('mastered');
    expect(v2.plan.totalHours).toBeLessThan(v1.plan.totalHours);
  });

  it('regenerating with nothing new does not pile up identical versions, but does after progress', async () => {
    const student = await readyStudent();
    const first = (await student.get('/roadmaps/current')).body.roadmap;
    const again = await student.post('/roadmaps/regenerate', {});
    expect(again.status).toBe(200);
    expect(again.body.roadmap.version).toBe(1);
    expect(again.body.roadmap.id).toBe(first.id);
    await student.patch(`/roadmaps/current/topics/${firstTopicOf(first.plan)}`, { done: true });
    expect((await student.post('/roadmaps/regenerate', {})).body.roadmap.version).toBe(2);
  });

  it('survives parallel first visits with exactly one active roadmap', async () => {
    const student = await readyStudent();
    const answers = await Promise.all([student.get('/roadmaps/current'), student.get('/roadmaps/current'), student.get('/roadmaps/current')]);
    for (const res of answers) expect(res.status).toBe(200);
    expect(await mongoose.model('Roadmap').countDocuments({ userId: student.id, status: 'active' })).toBe(1);
  });
});

describe('progress', () => {
  it('ticking a topic raises the percentage, and unticking lowers it again', async () => {
    const student = await readyStudent();
    const { plan } = (await student.get('/roadmaps/current')).body.roadmap;
    const topicId = firstTopicOf(plan);
    const done = (await student.patch(`/roadmaps/current/topics/${topicId}`, { done: true })).body.progress;
    expect(done.topicsDone).toBe(1);
    expect(done.percentComplete).toBeGreaterThan(0);
    expect(done.topicStatus[topicId]).toBe('done');
    const undone = (await student.patch(`/roadmaps/current/topics/${topicId}`, { done: false })).body.progress;
    expect(undone.topicsDone).toBe(0);
    expect(undone.percentComplete).toBe(0);
  });

  it('ticking twice does not create duplicate events', async () => {
    const student = await readyStudent();
    const topicId = firstTopicOf((await student.get('/roadmaps/current')).body.roadmap.plan);
    await student.patch(`/roadmaps/current/topics/${topicId}`, { done: true });
    await student.patch(`/roadmaps/current/topics/${topicId}`, { done: true });
    expect(await mongoose.model('ProgressEvent').countDocuments({ userId: student.id, type: 'complete' })).toBe(1);
  });

  it('logs time spent and reports it', async () => {
    const student = await readyStudent();
    const topicId = firstTopicOf((await student.get('/roadmaps/current')).body.roadmap.plan);
    const res = await student.patch(`/roadmaps/current/topics/${topicId}`, { done: true, minutesSpent: 90 });
    expect(res.body.progress.loggedHours).toBe(1.5);
    expect(res.body.progress.minutesByTopic[topicId]).toBe(90);
  });

  it('validates input', async () => {
    const student = await readyStudent();
    const topicId = firstTopicOf((await student.get('/roadmaps/current')).body.roadmap.plan);
    expect((await student.patch(`/roadmaps/current/topics/${topicId}`, {})).status).toBe(400);
    expect((await student.patch(`/roadmaps/current/topics/${topicId}`, { done: 'yes' })).status).toBe(400);
    expect((await student.patch(`/roadmaps/current/topics/${topicId}`, { minutesSpent: 0 })).status).toBe(400);
    expect((await student.patch(`/roadmaps/current/topics/${topicId}`, { minutesSpent: 99999 })).status).toBe(400);
    expect((await student.patch(`/roadmaps/current/topics/${topicId}`, { minutesSpent: 1.5 })).status).toBe(400);
    expect((await student.patch('/roadmaps/current/topics/not-a-topic', { done: true })).status).toBe(404);
  });

  it('a regenerated roadmap keeps finished work finished and never schedules it again', async () => {
    const student = await readyStudent();
    const v1 = (await student.get('/roadmaps/current')).body.roadmap;
    const finished = [...new Set(v1.plan.weeks[0].topics.map((t) => t.topicId))];
    for (const topicId of finished) await student.patch(`/roadmaps/current/topics/${topicId}`, { done: true });

    await student.chooseGoal({ ...frontend, hoursPerWeek: 20 });
    const { roadmap: v2, progress } = (await student.get('/roadmaps/current')).body;
    expect(v2.version).toBe(2);
    const scheduled = new Set(v2.plan.weeks.flatMap((w) => w.topics.map((t) => t.topicId)));
    for (const topicId of finished) expect(scheduled.has(topicId), topicId).toBe(false);
    expect(v2.plan.completedTopics.map((t) => t.topicId).sort()).toEqual([...finished].sort());
    expect(progress.percentComplete).toBeGreaterThan(0);
    expect(progress.carriedHours).toBeGreaterThan(0);
  });

  it('a finished topic that is no longer part of the goal drops out of progress', async () => {
    const student = await readyStudent();
    const v1 = (await student.get('/roadmaps/current')).body.roadmap;
    await student.patch(`/roadmaps/current/topics/${firstTopicOf(v1.plan)}`, { done: true });
    await student.chooseGoal({ goalId: 'mobile_dev', subTrack: 'flutter', hoursPerWeek: 10 });
    const { roadmap, progress } = (await student.get('/roadmaps/current')).body;
    expect(roadmap.plan.completedTopics).toEqual([]);
    expect(progress.percentComplete).toBe(0);
  });

  it('the dashboard returns progress without the heavy plan', async () => {
    const student = await readyStudent();
    const res = await student.get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.roadmap.plan).toBeUndefined();
    expect(res.body.roadmap.totalWeeks).toBeGreaterThan(0);
    expect(res.body.progress.weekly.length).toBe(res.body.roadmap.totalWeeks);
    expect(res.body.progress.nextUp.length).toBeGreaterThan(0);
  });
});

describe('the students own calendar day', () => {
  const dayOffset = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  it('starts the plan on the day the browser reports', async () => {
    const student = await readyStudent();
    const ahead = dayOffset(1); // e.g. India just after midnight while UTC is still yesterday
    const res = await student.get('/roadmaps/current').set('X-Client-Date', ahead);
    expect(res.body.roadmap.plan.startDate).toBe(ahead);
    expect(res.body.roadmap.plan.weeks[0].startDate).toBe(ahead);
  });

  it('ignores a missing, malformed or implausible date', async () => {
    const utc = dayOffset(0);
    for (const header of [undefined, 'yesterday', '2026-13-45', '1999-01-01', '2999-01-01', "2026-01-01'; drop"]) {
      const student = await readyStudent();
      const req = student.get('/roadmaps/current');
      if (header) req.set('X-Client-Date', header);
      expect((await req).body.roadmap.plan.startDate, String(header)).toBe(utc);
    }
  });

  it('records the students day on progress events', async () => {
    const student = await readyStudent();
    const topicId = firstTopicOf((await student.get('/roadmaps/current')).body.roadmap.plan);
    const day = dayOffset(1);
    await student.patch(`/roadmaps/current/topics/${topicId}`, { done: true, minutesSpent: 20 }).set('X-Client-Date', day);
    const events = await mongoose.model('ProgressEvent').find({ userId: student.id }).lean();
    expect(events.length).toBe(2);
    expect(events.every((event) => event.day === day)).toBe(true);
  });
});

describe('undoing finished work after a new version', () => {
  it('un-ticking a carried-over topic puts it back into the plan', async () => {
    const student = await readyStudent();
    const v1 = (await student.get('/roadmaps/current')).body.roadmap;
    const topicId = firstTopicOf(v1.plan);
    await student.patch(`/roadmaps/current/topics/${topicId}`, { done: true });
    await student.chooseGoal({ ...frontend, hoursPerWeek: 20 });
    const v2 = (await student.get('/roadmaps/current')).body.roadmap;
    expect(v2.plan.completedTopics.some((t) => t.topicId === topicId)).toBe(true);

    const undo = await student.patch(`/roadmaps/current/topics/${topicId}`, { done: false });
    expect(undo.status).toBe(200);
    expect(undo.body.roadmapChanged).toBe(true);
    const v3 = (await student.get('/roadmaps/current')).body;
    expect(v3.roadmap.version).toBe(3);
    expect(v3.roadmap.plan.completedTopics.some((t) => t.topicId === topicId)).toBe(false);
    expect(v3.roadmap.plan.weeks.some((w) => w.topics.some((t) => t.topicId === topicId))).toBe(true);
    expect(v3.progress.topicsDone).toBe(0);
  });

  it('ticking a carried-over topic again changes nothing, and time cannot be logged on it', async () => {
    const student = await readyStudent();
    const topicId = firstTopicOf((await student.get('/roadmaps/current')).body.roadmap.plan);
    await student.patch(`/roadmaps/current/topics/${topicId}`, { done: true });
    await student.chooseGoal({ ...frontend, hoursPerWeek: 20 });
    await student.get('/roadmaps/current');
    const again = await student.patch(`/roadmaps/current/topics/${topicId}`, { done: true });
    expect(again.status).toBe(200);
    expect(again.body.roadmapChanged).toBe(false);
    expect((await student.patch(`/roadmaps/current/topics/${topicId}`, { minutesSpent: 30 })).status).toBe(400);
  });
});
