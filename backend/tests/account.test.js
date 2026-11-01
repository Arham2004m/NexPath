import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { newStudent, startDatabase, stopDatabase } from './helpers/api.js';

let app;
beforeAll(async () => { app = await startDatabase(); });
afterAll(async () => { await stopDatabase(); });

const signIn = (email, password) => request(app).post('/api/auth/login').send({ email, password });

describe('account settings', () => {
  it('requires sign-in', async () => {
    expect((await request(app).patch('/api/auth/me').send({ name: 'Zed' })).status).toBe(401);
    expect((await request(app).post('/api/auth/change-password').send({})).status).toBe(401);
  });

  it('changes the display name, trimmed, and rejects bad names', async () => {
    const student = await newStudent(app);
    const ok = await request(app).patch('/api/auth/me').set(student.auth).send({ name: '  Priya Nair  ' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.name).toBe('Priya Nair');
    expect((await student.get('/auth/me')).body.user.name).toBe('Priya Nair');
    for (const name of [undefined, '', ' a ', 'x'.repeat(81), 42, null, { $ne: 1 }]) {
      const bad = await request(app).patch('/api/auth/me').set(student.auth).send({ name });
      expect(bad.status).toBe(400);
      expect(bad.body.errors.name).toBeTruthy();
    }
    // Only the name can change here, whatever else is sent.
    const sneaky = await request(app).patch('/api/auth/me').set(student.auth).send({ name: 'Priya Nair', email: 'x@y.com', goalId: 'faang' });
    expect(sneaky.body.user.email).toBe(student.email);
    expect(sneaky.body.user.goalId).toBeNull();
  });

  it('changes the password only with the right current password, and the old one stops working', async () => {
    const student = await newStudent(app);
    const change = (body) => request(app).post('/api/auth/change-password').set(student.auth).send(body);
    const wrong = await change({ currentPassword: 'Nope12345', newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors.currentPassword).toBeTruthy();
    expect((await signIn(student.email, 'Passw0rdX')).status).toBe(200); // unchanged

    const ok = await change({ currentPassword: 'Passw0rdX', newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toMatch(/hash|Brand9Newer/);
    expect((await signIn(student.email, 'Passw0rdX')).status).toBe(401);
    expect((await signIn(student.email, 'Brand9Newer')).status).toBe(200);
  });

  it('explains every invalid password field and never crashes on odd input', async () => {
    const student = await newStudent(app);
    const change = (body) => request(app).post('/api/auth/change-password').set(student.auth).send(body);
    const cases = [
      [{}, ['currentPassword', 'newPassword', 'confirmPassword']],
      [{ currentPassword: 'Passw0rdX', newPassword: 'short', confirmPassword: 'short' }, ['newPassword']],
      [{ currentPassword: 'Passw0rdX', newPassword: 'alllowercase1', confirmPassword: 'alllowercase1' }, ['newPassword']],
      [{ currentPassword: 'Passw0rdX', newPassword: 'x'.repeat(73) + 'Aa1', confirmPassword: 'x'.repeat(73) + 'Aa1' }, ['newPassword']],
      [{ currentPassword: 'Passw0rdX', newPassword: 'Brand9Newer', confirmPassword: 'Different9X' }, ['confirmPassword']],
      [{ currentPassword: 'Passw0rdX', newPassword: 'Passw0rdX', confirmPassword: 'Passw0rdX' }, ['newPassword']],
      [{ currentPassword: { $ne: 1 }, newPassword: ['a'], confirmPassword: 5 }, ['currentPassword', 'newPassword', 'confirmPassword']]
    ];
    for (const [body, fields] of cases) {
      const res = await change(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(Object.keys(res.body.errors).sort()).toEqual([...fields].sort());
    }
    expect((await signIn(student.email, 'Passw0rdX')).status).toBe(200);
  });
});
