import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { newStudent, startDatabase, stopDatabase } from './helpers/api.js';
import { seedQuestions } from '../src/scripts/seedQuestions.js';
import { DOMAIN_KEYS } from '../src/data/domains.js';

let app;
beforeAll(async () => {
  app = await startDatabase();
  await seedQuestions();
});
afterAll(async () => { await stopDatabase(); });

const Question = () => mongoose.model('Question');

// Takes a domain's questions and answers them: `rightFor(question)` decides whether to answer correctly.
async function answerDomain(student, domain, rightFor = () => true) {
  const issued = (await student.post('/assessment/questions', { domains: [domain] })).body.questions[domain];
  const bank = await Question().find({ id: { $in: issued.map((q) => q.id) } }).select('+correct').lean();
  const answers = Object.fromEntries(issued.map((q) => {
    const truth = bank.find((b) => b.id === q.id).correct;
    return [q.id, rightFor(q) ? truth : (truth + 1) % q.options.length];
  }));
  return { issued, answers, ids: issued.map((q) => q.id) };
}

const skipAllExcept = (domain) => DOMAIN_KEYS.filter((d) => d !== domain);

describe('questions handed out', () => {
  it('require a login and name the domains without revealing bank sizes', async () => {
    const student = await newStudent(app);
    const res = await student.get('/assessment/domains');
    expect(res.body.domains.map((d) => d.key)).toEqual(DOMAIN_KEYS);
    expect(JSON.stringify(res.body)).not.toMatch(/poolSize|count|total/i);
  });

  it('give one easy, one medium and one hard question per domain and never the answers', async () => {
    const student = await newStudent(app);
    for (const domain of DOMAIN_KEYS) {
      const questions = (await student.post('/assessment/questions', { domains: [domain] })).body.questions[domain];
      expect(questions.map((q) => q.difficulty).sort(), domain).toEqual(['easy', 'hard', 'medium']);
      for (const q of questions) {
        expect(Object.keys(q).sort()).toEqual(['difficulty', 'id', 'options', 'question']);
        expect(q.options).toHaveLength(4);
      }
    }
  });

  it('prefer questions the student has not seen on a retake', async () => {
    const student = await newStudent(app);
    const first = await answerDomain(student, 'prog');
    await student.post('/assessment/submit', { skippedDomains: skipAllExcept('prog'), shownQuestions: { prog: first.ids }, answers: { prog: first.answers } });
    const second = (await student.post('/assessment/questions', { domains: ['prog'] })).body.questions.prog.map((q) => q.id);
    expect(second.filter((id) => first.ids.includes(id))).toEqual([]);
  });

  it('refuse unknown or empty domain lists', async () => {
    const student = await newStudent(app);
    for (const domains of [[], ['nope'], 'web', null, ['web', 'nope']]) expect((await student.post('/assessment/questions', { domains })).status).toBe(400);
  });
});

describe('scoring', () => {
  it('scores all-correct as Advanced, all-wrong as Beginner, and stores per-question results server-side only', async () => {
    const student = await newStudent(app);
    const right = await answerDomain(student, 'web', () => true);
    const res = await student.post('/assessment/submit', { skippedDomains: skipAllExcept('web'), shownQuestions: { web: right.ids }, answers: { web: right.answers } });
    expect(res.status).toBe(201);
    expect(res.body.attempt.profile.web).toMatchObject({ band: 'Advanced', score: 6, max: 6, assessmentMethod: 'tested' });
    expect(res.body.attempt.results).toBeUndefined();
    const stored = await mongoose.model('AssessmentAttempt').findById(res.body.attempt.id).lean();
    expect(stored.results.web).toHaveLength(3);
    expect(stored.results.web.every((r) => r.correct && r.nodeId)).toBe(true);

    const wrong = await answerDomain(student, 'web', () => false);
    const bad = await student.post('/assessment/submit', { skippedDomains: skipAllExcept('web'), shownQuestions: { web: wrong.ids }, answers: { web: wrong.answers } });
    expect(bad.body.attempt.profile.web).toMatchObject({ band: 'Beginner', score: 0 });
  });

  it('weights harder questions more (easy 1, medium 2, hard 3)', async () => {
    const student = await newStudent(app);
    const onlyHard = await answerDomain(student, 'dsa', (q) => q.difficulty === 'hard');
    const res = await student.post('/assessment/submit', { skippedDomains: skipAllExcept('dsa'), shownQuestions: { dsa: onlyHard.ids }, answers: { dsa: onlyHard.answers } });
    expect(res.body.attempt.profile.dsa.score).toBe(3);
    expect(res.body.attempt.profile.dsa.band).toBe('Intermediate');
  });

  it('treats unanswered questions as wrong and skipped domains as self-reported Beginner', async () => {
    const student = await newStudent(app);
    const set = await answerDomain(student, 'os');
    const res = await student.post('/assessment/submit', { skippedDomains: skipAllExcept('os'), shownQuestions: { os: set.ids }, answers: { os: {} } });
    expect(res.body.attempt.profile.os.score).toBe(0);
    expect(res.body.attempt.profile.dsa).toMatchObject({ band: 'Beginner', assessmentMethod: 'self-reported' });
  });

  it('latest returns the newest attempt for that student only', async () => {
    const alice = await newStudent(app);
    const bob = await newStudent(app);
    expect((await alice.get('/assessment/latest')).body.attempt).toBeNull();
    await alice.takeAssessmentAsBeginner();
    expect((await alice.get('/assessment/latest')).body.attempt.profile.web.band).toBe('Beginner');
    expect((await bob.get('/assessment/latest')).body.attempt).toBeNull();
  });
});

describe('cannot be gamed', () => {
  it('rejects questions that were never issued to this student', async () => {
    const student = await newStudent(app);
    const real = await answerDomain(student, 'web');
    const cherryPicked = (await Question().find({ domain: 'web', difficulty: 'easy' }).limit(3).lean()).map((q) => q.id);
    expect(cherryPicked.sort()).not.toEqual([...real.ids].sort());
    const res = await student.post('/assessment/submit', { skippedDomains: skipAllExcept('web'), shownQuestions: { web: cherryPicked }, answers: { web: {} } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not the ones issued/i);
  });

  it('rejects a subset or a superset of the issued questions', async () => {
    const student = await newStudent(app);
    const real = await answerDomain(student, 'web');
    const subset = await student.post('/assessment/submit', { skippedDomains: skipAllExcept('web'), shownQuestions: { web: real.ids.slice(0, 1) }, answers: { web: real.answers } });
    expect(subset.status).toBe(400);
    const extra = (await Question().findOne({ domain: 'web', id: { $nin: real.ids } }).lean()).id;
    const superset = await student.post('/assessment/submit', { skippedDomains: skipAllExcept('web'), shownQuestions: { web: [...real.ids, extra] }, answers: { web: real.answers } });
    expect(superset.status).toBe(400);
  });

  it('rejects another student\'s question set', async () => {
    const alice = await newStudent(app);
    const mallory = await newStudent(app);
    const aliceSet = await answerDomain(alice, 'web');
    await answerDomain(mallory, 'web'); // Mallory got a different random set
    const res = await mallory.post('/assessment/submit', { skippedDomains: skipAllExcept('web'), shownQuestions: { web: aliceSet.ids }, answers: { web: aliceSet.answers } });
    // Only fails when the two random sets differ, which for three questions of fifteen is almost always; make it certain.
    const issuedToMallory = (await mongoose.model('IssuedQuestions').findOne({ userId: mallory.id, domain: 'web' }).lean()).questionIds;
    if ([...issuedToMallory].sort().join() !== [...aliceSet.ids].sort().join()) expect(res.status).toBe(400);
  });

  it('a new set replaces the old one, so a stale submission is refused', async () => {
    const student = await newStudent(app);
    const stale = await answerDomain(student, 'web');
    await answerDomain(student, 'web'); // a second request issues a new set
    const issued = (await mongoose.model('IssuedQuestions').findOne({ userId: student.id, domain: 'web' }).lean()).questionIds;
    const res = await student.post('/assessment/submit', { skippedDomains: skipAllExcept('web'), shownQuestions: { web: stale.ids }, answers: { web: stale.answers } });
    expect(res.status).toBe(issued.slice().sort().join() === stale.ids.slice().sort().join() ? 201 : 400);
  });

  it('rejects oversized or malformed submissions', async () => {
    const student = await newStudent(app);
    const base = { skippedDomains: [], answers: {} };
    for (const shownQuestions of [{ web: Array.from({ length: 50 }, (_, i) => `web-e${i}`) }, { web: 'web-e1' }, { web: [1] }, { web: [] }, { nope: ['x'] }]) {
      const res = await student.post('/assessment/submit', { ...base, shownQuestions });
      expect(res.status, JSON.stringify(shownQuestions).slice(0, 40)).toBeLessThan(500);
    }
    expect((await student.post('/assessment/submit', { skippedDomains: ['bogus'], shownQuestions: {}, answers: {} })).status).toBe(400);
  });
});
