import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startDatabase, stopDatabase } from './helpers/api.js';
import { DEMO_PASSWORD, DEMO_STUDENTS, seedDemo } from '../src/scripts/seedDemo.js';
import ReplanEvent from '../src/models/ReplanEvent.js';
import User from '../src/models/User.js';
import Roadmap from '../src/models/Roadmap.js';

let app;
beforeAll(async () => { app = await startDatabase(); });
afterAll(async () => { await stopDatabase(); });

const signIn = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  expect(res.status).toBe(200);
  const auth = { Authorization: `Bearer ${res.body.accessToken}` };
  return { auth, get: (path) => request(app).get(`/api${path}`).set(auth) };
};

describe('demo data', () => {
  it('creates two signed-in-able students with realistic history, and can be re-run safely', async () => {
    await seedDemo();
    await seedDemo(); // again: still exactly two demo accounts
    expect(await User.countDocuments({ email: { $in: DEMO_STUDENTS.map((s) => s.email) } })).toBe(2);
    expect(await Roadmap.countDocuments({ status: 'active' })).toBe(2);

    const riya = await signIn('demo.ontrack@nexpath.dev');
    const home = (await riya.get('/dashboard')).body;
    expect(home.progress.percentComplete).toBeGreaterThan(10);
    expect(home.progress.percentComplete).toBeLessThan(60);
    expect(home.progress.currentWeek).toBe(6);
    expect(home.progress.pace).toBe('on_track');
    expect(home.progress.loggedHours).toBeGreaterThan(10);
    expect((await riya.get('/roadmaps/current')).body.replan?.event ?? null).toBeNull(); // nothing to fix for her
  });

  it('puts the second student behind so the replanner shows its work the first time the app loads', async () => {
    await seedDemo();
    const karan = await signIn('demo.behind@nexpath.dev');
    const first = (await karan.get('/dashboard')).body; // opening the app is what triggers the automatic check
    expect(first.replan.event.action).toBe('shift');
    expect(first.replan.event.seenAt).toBeNull();
    expect(first.replan.event.message).toMatch(/behind schedule/);
    expect(first.replan.event.metrics.lagWeeks).toBeGreaterThanOrEqual(2);
    expect(first.progress.carriedHours).toBeGreaterThan(0); // finished work is carried over, not lost

    const opened = (await karan.get('/roadmaps/current')).body;
    expect(opened.roadmap.version).toBe(2);
    expect(opened.replan.event.id).toBe(first.replan.event.id);
    expect(await ReplanEvent.countDocuments({ action: 'shift' })).toBe(1);
    expect(opened.progress.pace).not.toBe('behind');
  });
});
