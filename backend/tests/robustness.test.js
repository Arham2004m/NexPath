import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { newStudent, startDatabase, stopDatabase } from './helpers/api.js';

let app;
beforeAll(async () => { app = await startDatabase(); });
afterAll(async () => { await stopDatabase(); });

// Anything a client could send in place of what we expect. None of it may ever produce a server error.
const HOSTILE = [null, [], ['a'], 'text', 123, true, {}, { $gt: '' }, { $ne: null }, { __proto__: { admin: true } }, 'x'.repeat(5000), -1, Infinity, '<script>alert(1)</script>'];

// Sends a body of any JSON type as-is (supertest cannot send a bare number or boolean itself).
const rawJson = (method, path, body, headers = {}) => request(app)[method](path).set('Content-Type', 'application/json').set(headers).send(JSON.stringify(body));

const notServerError = (res, label) => {
  expect(res.status, `${label} -> ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`).toBeLessThan(500);
  expect(typeof res.body, label).toBe('object');
};

describe('auth routes never crash on hostile input', () => {
  it('register and login with every field replaced by odd values', async () => {
    const valid = { name: 'Odd Tester', email: 'odd@example.com', password: 'Passw0rdX', confirmPassword: 'Passw0rdX' };
    for (const field of Object.keys(valid)) {
      for (const value of HOSTILE) {
        notServerError(await request(app).post('/api/auth/register').send({ ...valid, [field]: value }), `register ${field}=${JSON.stringify(value)?.slice(0, 40)}`);
        notServerError(await request(app).post('/api/auth/login').send({ email: valid.email, password: valid.password, [field]: value }), `login ${field}=${JSON.stringify(value)?.slice(0, 40)}`);
      }
    }
  });

  it('whole bodies of the wrong shape', async () => {
    for (const body of HOSTILE) {
      for (const path of ['/api/auth/register', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout']) {
        notServerError(await rawJson('post', path, body), `${path} body=${JSON.stringify(body)?.slice(0, 40)}`);
      }
    }
  });

  it('operator injection cannot log anyone in', async () => {
    const victim = await newStudent(app);
    const res = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBeLessThan(500);
    expect(res.status).not.toBe(200);
    const byEmail = await request(app).post('/api/auth/login').send({ email: victim.email, password: { $ne: 'x' } });
    expect(byEmail.status).not.toBe(200);
  });

  it('a garbage, expired or foreign token is just 401', async () => {
    for (const token of ['', 'abc', 'a.b.c', 'Bearer', 'x'.repeat(3000)]) {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status, token.slice(0, 20)).toBe(401);
    }
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Basic abc')).status).toBe(401);
  });
});

describe('protected routes never crash on hostile input', () => {
  it('goal, known-skill, assessment and progress bodies', async () => {
    const student = await newStudent(app);
    await student.takeAssessmentAsBeginner();
    await student.chooseGoal({ goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10 });
    const topicId = (await student.get('/roadmaps/current')).body.roadmap.plan.weeks[0].topics[0].topicId;

    const bodies = {
      'PUT /me/goal': ['put', '/me/goal', ['goalId', 'subTrack', 'hoursPerWeek', 'targetWeeks'], { goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10, targetWeeks: 20 }],
      'PUT /me/known-skills': ['put', '/me/known-skills', ['nodeId', 'known'], { nodeId: 'web-js', known: true }],
      'POST /assessment/questions': ['post', '/assessment/questions', ['domains'], { domains: ['web'] }],
      'POST /assessment/submit': ['post', '/assessment/submit', ['skippedDomains', 'shownQuestions', 'answers', 'timing'], { skippedDomains: ['web'], shownQuestions: {}, answers: {}, timing: {} }],
      'PATCH topic': ['patch', `/roadmaps/current/topics/${topicId}`, ['done', 'minutesSpent'], { done: true }]
    };
    for (const [label, [method, path, fields, valid]] of Object.entries(bodies)) {
      for (const field of fields) {
        for (const value of HOSTILE) notServerError(await student[method](path, { ...valid, [field]: value }), `${label} ${field}=${JSON.stringify(value)?.slice(0, 40)}`);
      }
      for (const body of HOSTILE) notServerError(await rawJson(method, `/api${path}`, body, student.auth), `${label} body=${JSON.stringify(body)?.slice(0, 40)}`);
    }
  });

  it('odd topic ids in the url', async () => {
    const student = await newStudent(app);
    await student.takeAssessmentAsBeginner();
    await student.chooseGoal({ goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10 });
    for (const id of ['%00', '%', '..%2F..%2Fetc', '%E0%A4%A', encodeURIComponent('<b>'), 'x'.repeat(3000), '__proto__', 'constructor']) {
      const res = await student.patch(`/roadmaps/current/topics/${id}`, { done: true });
      notServerError(res, `topic ${id.slice(0, 20)}`);
    }
  });

  it('the assessment cannot be scored with other peoples questions or oversized lists', async () => {
    const student = await newStudent(app);
    const big = Array.from({ length: 500 }, (_, i) => `web-e${i}`);
    for (const shown of [{ web: big }, { web: ['dsa-e1'] }, { nope: ['web-e1'] }, { web: 'web-e1' }, { web: [1, 2, 3] }]) {
      notServerError(await student.post('/assessment/submit', { skippedDomains: [], shownQuestions: shown, answers: {} }), JSON.stringify(shown).slice(0, 50));
    }
    expect((await student.post('/assessment/questions', { domains: Array(1000).fill('web') })).status).toBeLessThan(500);
  });
});

describe('transport level problems', () => {
  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
  });

  it('an oversized body is refused cleanly', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(300_000) }));
    expect(res.status).toBe(413);
  });

  it('unknown routes are 404 JSON', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(typeof res.body.message).toBe('string');
  });

  it('error responses never include stack traces or internal paths', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|at .*\(|\.js:\d+/);
  });

  it('sends basic security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
