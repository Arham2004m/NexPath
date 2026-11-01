import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { newStudent, startDatabase, stopDatabase } from './helpers/api.js';

let app;
beforeAll(async () => { app = await startDatabase(); });
afterAll(async () => { await stopDatabase(); });

const details = (n) => ({ name: 'Asha Rao', email: `asha${n}-${Date.now()}@Example.com`, password: 'Passw0rdX', confirmPassword: 'Passw0rdX' });
const register = (body) => request(app).post('/api/auth/register').send(body);
const cookieOf = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('refreshToken='));

describe('registration', () => {
  it('creates an account, signs in, and sets a locked-down refresh cookie', async () => {
    const res = await register(details(1));
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ name: 'Asha Rao', goalId: null, onboardingComplete: false });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/); // no password hash anywhere
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('stores the email lower-cased and trims the name', async () => {
    const body = { ...details(2), name: '  Asha Rao  ' };
    const res = await register(body);
    expect(res.body.user.email).toBe(body.email.toLowerCase());
    expect(res.body.user.name).toBe('Asha Rao');
  });

  it('refuses a duplicate email in any letter case', async () => {
    const body = details(3);
    expect((await register(body)).status).toBe(201);
    const again = await register({ ...body, email: body.email.toUpperCase() });
    expect(again.status).toBe(409);
    expect(again.body.errors.email).toBeTruthy();
  });

  it('explains every invalid field', async () => {
    const cases = [
      [{ name: 'A' }, 'name'], [{ name: 'x'.repeat(81) }, 'name'], [{ email: 'not-an-email' }, 'email'], [{ email: `${'a'.repeat(250)}@b.co` }, 'email'],
      [{ password: 'short1A', confirmPassword: 'short1A' }, 'password'], [{ password: 'alllowercase1', confirmPassword: 'alllowercase1' }, 'password'],
      [{ password: 'NoDigitsHere', confirmPassword: 'NoDigitsHere' }, 'password'], [{ password: `Aa1${'x'.repeat(70)}`, confirmPassword: `Aa1${'x'.repeat(70)}` }, 'password'],
      [{ confirmPassword: 'Different1A' }, 'confirmPassword']
    ];
    for (const [change, field] of cases) {
      const res = await register({ ...details(4), ...change });
      expect(res.status, JSON.stringify(change).slice(0, 60)).toBe(400);
      expect(res.body.errors[field], field).toBeTruthy();
    }
  });
});

describe('sign in, refresh and sign out', () => {
  it('signs in with any letter case of the email and rejects a wrong password without saying which part was wrong', async () => {
    const body = details(5);
    await register(body);
    const ok = await request(app).post('/api/auth/login').send({ email: body.email.toUpperCase(), password: body.password });
    expect(ok.status).toBe(200);
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: body.email, password: 'Wrong1Password' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Wrong1Password' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('the access token opens protected routes and /me', async () => {
    const student = await newStudent(app, 'Me Check');
    const me = await student.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Me Check');
  });

  it('refresh trades the cookie for a new access token', async () => {
    const res = await register(details(6));
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(res).split(';')[0]);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.user.email).toBe(res.body.user.email);
  });

  it('refresh fails without a cookie, with a tampered one, with an access token, or for a deleted account', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', 'refreshToken=garbage')).status).toBe(401);
    const res = await register(details(7));
    const accessAsRefresh = `refreshToken=${res.body.accessToken}`;
    expect((await request(app).post('/api/auth/refresh').set('Cookie', accessAsRefresh)).status).toBe(401);
    const forged = jwt.sign({ sub: res.body.user.id }, 'some-other-secret', { expiresIn: '7d' });
    expect((await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${forged}`)).status).toBe(401);
    await mongoose.model('User').deleteOne({ _id: res.body.user.id });
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(res).split(';')[0])).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`)).status).toBe(401);
  });

  it('an expired access token is refused', async () => {
    const res = await register(details(8));
    const expired = jwt.sign({ sub: res.body.user.id }, process.env.JWT_ACCESS_SECRET, { expiresIn: -10 });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
  });

  it('logout clears the cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(cookieOf(res)).toMatch(/refreshToken=;/);
  });
});

describe('goal selection', () => {
  const valid = { goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10 };

  it('lists every goal with its real effort, publicly', async () => {
    const res = await request(app).get('/api/goals');
    expect(res.status).toBe(200);
    expect(res.body.goals).toHaveLength(8);
    for (const goal of res.body.goals) {
      const entities = goal.subTracks || [goal];
      for (const entity of entities) {
        expect(entity.roadmapReady, goal.id).toBe(true);
        expect(entity.estimatedHours, goal.id).toBeGreaterThan(0);
        const weeks = Object.entries(entity.weeksByHours).sort((a, b) => a[0] - b[0]).map(([, w]) => w);
        expect(weeks[0], goal.id).toBeGreaterThan(weeks[weeks.length - 1]);
        expect([...weeks].sort((a, b) => b - a)).toEqual(weeks);
      }
    }
    expect(res.body.limits.hoursPerWeek).toEqual({ min: 3, max: 40 });
  });

  it('saves a valid goal and reports whether the student is onboarded', async () => {
    const student = await newStudent(app);
    const before = await student.chooseGoal(valid);
    expect(before.status).toBe(200);
    expect(before.body.user).toMatchObject({ goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10, onboardingComplete: false });
    await student.takeAssessmentAsBeginner();
    const after = await student.chooseGoal({ ...valid, hoursPerWeek: 12 });
    expect(after.body.user).toMatchObject({ hoursPerWeek: 12, onboardingComplete: true });
    expect((await student.get('/auth/me')).body.user.hoursPerWeek).toBe(12);
  });

  it('rejects every invalid combination with a field error', async () => {
    const student = await newStudent(app);
    const cases = [
      [{ goalId: 'astronaut' }, 'goalId'], [{ goalId: undefined }, 'goalId'], [{ subTrack: undefined }, 'subTrack'], [{ subTrack: 'android' }, 'subTrack'],
      [{ goalId: 'faang', subTrack: 'frontend' }, 'subTrack'], [{ hoursPerWeek: 2 }, 'hoursPerWeek'], [{ hoursPerWeek: 41 }, 'hoursPerWeek'],
      [{ hoursPerWeek: 10.5 }, 'hoursPerWeek'], [{ hoursPerWeek: '10' }, 'hoursPerWeek'], [{ hoursPerWeek: null }, 'hoursPerWeek'],
      [{ targetWeeks: 0 }, 'targetWeeks'], [{ targetWeeks: 105 }, 'targetWeeks'], [{ targetWeeks: 'soon' }, 'targetWeeks']
    ];
    for (const [change, field] of cases) {
      const res = await student.chooseGoal({ ...valid, ...change });
      expect(res.status, JSON.stringify(change)).toBe(400);
      expect(res.body.errors[field], field).toBeTruthy();
    }
    expect((await student.get('/auth/me')).body.user.goalId).toBeNull(); // nothing was saved
  });

  it('warns, but still saves, when the deadline is shorter than a beginner needs at those hours', async () => {
    const student = await newStudent(app);
    const tight = await student.chooseGoal({ ...valid, targetWeeks: 4 });
    expect(tight.status).toBe(200);
    expect(tight.body.warning).toMatch(/about 11 weeks/);
    const fine = await student.chooseGoal({ ...valid, targetWeeks: 20 });
    expect(fine.body.warning).toBeNull();
  });

  it('can switch goals and clears the sub-track for goals without one', async () => {
    const student = await newStudent(app);
    await student.chooseGoal(valid);
    const switched = await student.chooseGoal({ goalId: 'gate', hoursPerWeek: 15 });
    expect(switched.body.user).toMatchObject({ goalId: 'gate', subTrack: null, hoursPerWeek: 15 });
  });

  it('recommends goals only once there is an assessment, with reasons', async () => {
    const student = await newStudent(app);
    expect((await student.get('/goals/recommendations')).body.recommendations).toEqual([]);
    await student.takeAssessmentAsBeginner();
    const { recommendations } = (await student.get('/goals/recommendations')).body;
    expect(recommendations).toHaveLength(8);
    expect(recommendations[0].reasons.length).toBeGreaterThan(0);
    expect(recommendations.map((r) => r.score)).toEqual([...recommendations.map((r) => r.score)].sort((a, b) => b - a));
  });
});

describe('known skills', () => {
  it('stores, deduplicates and removes skills, and refuses unknown ones and capstones', async () => {
    const student = await newStudent(app);
    await student.takeAssessmentAsBeginner();
    await student.chooseGoal({ goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10 });
    expect((await student.put('/me/known-skills', { nodeId: 'web-js', known: true })).body.knownSkills).toEqual(['web-js']);
    expect((await student.put('/me/known-skills', { nodeId: 'web-js', known: true })).body.knownSkills).toEqual(['web-js']);
    expect((await student.put('/me/known-skills', { nodeId: 'web-js', known: false })).body.knownSkills).toEqual([]);
    expect((await student.put('/me/known-skills', { nodeId: 'made-up', known: true })).status).toBe(400);
    expect((await student.put('/me/known-skills', { nodeId: 'web-js', known: 'yes' })).status).toBe(400);
    const capstone = await student.put('/me/known-skills', { nodeId: 'web-portfolio', known: true });
    expect(capstone.status).toBe(400);
    expect(capstone.body.message).toMatch(/cannot be skipped/);
  });
});
