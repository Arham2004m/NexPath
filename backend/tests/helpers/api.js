// Shared harness for the route tests: an in-memory MongoDB plus helpers that act as real students.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

let server;

export async function startDatabase() {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  // Build indexes (including the one-active-roadmap rule) before any request arrives.
  const { default: app } = await import('../../src/app.js');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return app;
}

export async function stopDatabase() {
  await mongoose.disconnect();
  await server?.stop();
}

let counter = 0;

// Registers a new student and returns helpers bound to their access token.
export async function newStudent(app, name = 'Test Student') {
  counter += 1;
  const email = `student${counter}-${Date.now()}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'Passw0rdX', confirmPassword: 'Passw0rdX' });
  const auth = { Authorization: `Bearer ${res.body.accessToken}` };
  const as = (method, path) => request(app)[method](`/api${path}`).set(auth);
  return {
    id: res.body.user.id, email, auth,
    get: (path) => as('get', path),
    post: (path, body) => as('post', path).send(body),
    put: (path, body) => as('put', path).send(body),
    patch: (path, body) => as('patch', path).send(body),
    // Every domain self-reported as new: the plain beginner start.
    takeAssessmentAsBeginner: () => as('post', '/assessment/submit').send({ skippedDomains: ['prog', 'dsa', 'os', 'dbms', 'web', 'aiml', 'cn', 'sd', 'mobile'], shownQuestions: {}, answers: {} }),
    chooseGoal: (goal) => as('put', '/me/goal').send(goal)
  };
}
