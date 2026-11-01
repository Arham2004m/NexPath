import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { SMTPServer } from 'smtp-server';
import { newStudent, startDatabase, stopDatabase } from './helpers/api.js';
import { setMailer } from '../src/services/mailer.js';
import PasswordReset from '../src/models/PasswordReset.js';
import User from '../src/models/User.js';

let app;
const sent = [];
beforeAll(async () => { app = await startDatabase(); });
afterAll(async () => { setMailer(null); await stopDatabase(); });
afterEach(() => { setMailer(null); sent.length = 0; });

const capture = () => setMailer(async (mail) => { sent.push(mail); });
const until = async (check) => { for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20)); };
const forgot = (email) => request(app).post('/api/auth/forgot-password').send({ email });
const reset = (body) => request(app).post('/api/auth/reset-password').send(body);
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const tokenOf = (mail) => /reset-password\?token=([\w-]+)/.exec(mail.text)[1];
const GENERIC = /If an account exists/;

describe('forgot password', () => {
  it('answers identically for known and unknown emails, and only emails real accounts', async () => {
    capture();
    const student = await newStudent(app);
    const known = await forgot(student.email.toUpperCase());
    const unknown = await forgot('nobody-here@example.com');
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.message).toMatch(GENERIC);
    await until(() => sent.length >= 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(student.email);
    expect(sent[0].text).toContain(`${process.env.CLIENT_URL}/reset-password?token=`);
    expect(sent[0].text).not.toMatch(/Passw0rd/);
  });

  it('stores only a hash of the token, and the link works for one hour', async () => {
    capture();
    const student = await newStudent(app);
    await forgot(student.email);
    await until(() => sent.length >= 1);
    const token = tokenOf(sent[0]);
    expect(token.length).toBeGreaterThan(30);
    const record = await PasswordReset.findOne({ userId: student.id });
    expect(record.tokenHash).not.toBe(token);
    expect(JSON.stringify(record)).not.toContain(token);
    const lifetime = record.expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(55 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(60 * 60_000);
  });

  it('rejects an invalid address and sends at most three links an hour per account', async () => {
    capture();
    for (const email of [undefined, '', 'nope', 42, { $ne: 1 }]) expect((await forgot(email)).status, String(email)).toBe(400);
    const student = await newStudent(app);
    for (let i = 0; i < 5; i++) expect((await forgot(student.email)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    expect(sent).toHaveLength(3);
    expect(await PasswordReset.countDocuments({ userId: student.id })).toBe(3);
  });

  it('still answers normally when the mail server is down', async () => {
    setMailer(async () => { throw new Error('connect ECONNREFUSED'); });
    const student = await newStudent(app);
    const res = await forgot(student.email);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(GENERIC);
  });
});

describe('reset password', () => {
  const requestLink = async () => {
    capture();
    const student = await newStudent(app);
    await forgot(student.email);
    await until(() => sent.length >= 1);
    return { student, token: tokenOf(sent[0]) };
  };

  it('sets the new password, once, and the old one stops working', async () => {
    const { student, token } = await requestLink();
    const ok = await reset({ token, newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toMatch(/Brand9Newer|hash/);
    expect((await login(student.email, 'Passw0rdX')).status).toBe(401);
    expect((await login(student.email, 'Brand9Newer')).status).toBe(200);
    const again = await reset({ token, newPassword: 'Another9Pass', confirmPassword: 'Another9Pass' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('RESET_INVALID');
    expect((await login(student.email, 'Brand9Newer')).status).toBe(200);
  });

  it('two simultaneous uses of one link: exactly one wins', async () => {
    const { token } = await requestLink();
    const results = await Promise.all([1, 2, 3].map((n) => reset({ token, newPassword: `Winner${n}Pass`, confirmPassword: `Winner${n}Pass` })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(2);
  });

  it('refuses unknown, expired and malformed tokens', async () => {
    const { token } = await requestLink();
    for (const bad of ['not-a-real-token', `${token.slice(0, -2)}xx`, 'x'.repeat(500), '']) {
      expect((await reset({ token: bad, newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' })).status, bad.slice(0, 10)).toBe(400);
    }
    for (const bad of [undefined, null, 5, { $ne: 1 }, ['a']]) expect((await reset({ token: bad, newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' })).status).toBe(400);
    await PasswordReset.collection.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await reset({ token, newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' });
    expect(expired.status).toBe(400);
    expect(expired.body.message).toMatch(/invalid or has expired/);
  });

  it('checks the new password first, without using up the link', async () => {
    const { student, token } = await requestLink();
    for (const [newPassword, confirmPassword, field] of [['short', 'short', 'newPassword'], ['alllowercase1', 'alllowercase1', 'newPassword'], ['Brand9Newer', 'Different9X', 'confirmPassword']]) {
      const res = await reset({ token, newPassword, confirmPassword });
      expect(res.status).toBe(400);
      expect(res.body.errors[field]).toBeTruthy();
    }
    expect((await login(student.email, 'Passw0rdX')).status).toBe(200);
    expect((await reset({ token, newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' })).status).toBe(200);
  });

  it('using one link kills the other links for that account', async () => {
    capture();
    const student = await newStudent(app);
    await forgot(student.email);
    await forgot(student.email);
    await until(() => sent.length >= 2);
    const [first, second] = sent.map(tokenOf);
    expect((await reset({ token: second, newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' })).status).toBe(200);
    expect((await reset({ token: first, newPassword: 'Other9Passw', confirmPassword: 'Other9Passw' })).status).toBe(400);
  });
});

describe('sessions are revoked when the password changes', () => {
  const session = async (student) => {
    const res = await login(student.email, 'Passw0rdX');
    return { access: res.body.accessToken, cookie: res.headers['set-cookie'].find((c) => c.startsWith('refreshToken=')).split(';')[0] };
  };
  const me = (access) => request(app).get('/api/auth/me').set({ Authorization: `Bearer ${access}` });
  const refresh = (cookie) => request(app).post('/api/auth/refresh').set('Cookie', cookie);

  it('a reset signs out every device', async () => {
    capture();
    const student = await newStudent(app);
    const phone = await session(student);
    expect((await me(phone.access)).status).toBe(200);
    expect((await refresh(phone.cookie)).status).toBe(200);
    await forgot(student.email);
    await until(() => sent.length >= 1);
    await reset({ token: tokenOf(sent[0]), newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' });
    expect((await me(phone.access)).status).toBe(401);
    expect((await refresh(phone.cookie)).status).toBe(401);
    const fresh = await login(student.email, 'Brand9Newer');
    expect((await me(fresh.body.accessToken)).status).toBe(200);
  });

  it('changing the password in Settings signs out the other devices but not this one', async () => {
    const student = await newStudent(app);
    const phone = await session(student);
    const laptop = await session(student);
    const change = await request(app).post('/api/auth/change-password').set({ Authorization: `Bearer ${laptop.access}` }).send({ currentPassword: 'Passw0rdX', newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' });
    expect(change.status).toBe(200);
    expect((await me(change.body.accessToken)).status).toBe(200);
    const newCookie = change.headers['set-cookie'].find((c) => c.startsWith('refreshToken=')).split(';')[0];
    expect((await refresh(newCookie)).status).toBe(200);
    expect((await me(phone.access)).status).toBe(401);
    expect((await refresh(phone.cookie)).status).toBe(401);
    expect((await me(laptop.access)).status).toBe(401);
  });

  it('tokens issued before this feature existed (no version) work until the password changes', async () => {
    const student = await newStudent(app);
    const access = jwt.sign({ sub: student.id }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: student.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    expect((await me(access)).status).toBe(200);
    expect((await refresh(`refreshToken=${refreshToken}`)).status).toBe(200);
    await User.updateOne({ _id: student.id }, { $inc: { tokenVersion: 1 } });
    expect((await me(access)).status).toBe(401);
    expect((await refresh(`refreshToken=${refreshToken}`)).status).toBe(401);
  });
});

describe('real SMTP delivery', () => {
  it('delivers the reset email through an SMTP server', async () => {
    const received = [];
    const server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, session, done) {
        let data = '';
        stream.on('data', (chunk) => { data += chunk; });
        stream.on('end', () => { received.push({ data, to: session.envelope.rcptTo.map((r) => r.address), from: session.envelope.mailFrom.address }); done(); });
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.server.address().port), MAIL_FROM: 'NexPath <noreply@nexpath.test>' });
    try {
      const student = await newStudent(app);
      expect((await forgot(student.email)).status).toBe(200);
      await until(() => received.length >= 1);
      expect(received).toHaveLength(1);
      expect(received[0].to).toEqual([student.email]);
      expect(received[0].from).toBe('noreply@nexpath.test');
      const body = received[0].data.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
      expect(body).toMatch(/Subject: Reset your NexPath password/);
      expect(body).toContain(`${process.env.CLIENT_URL}/reset-password?token=`);
    } finally {
      for (const key of ['SMTP_HOST', 'SMTP_PORT', 'MAIL_FROM']) delete process.env[key];
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
