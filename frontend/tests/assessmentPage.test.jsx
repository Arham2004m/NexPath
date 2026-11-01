import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssessmentPage from '../src/pages/AssessmentPage';
import { getDomains, sampleQuestions, submitAssessment } from '../src/services/assessmentApi';
import { renderPage } from './helpers';

vi.mock('../src/services/assessmentApi', () => ({ getDomains: vi.fn(), sampleQuestions: vi.fn(), submitAssessment: vi.fn(), getLatestAttempt: vi.fn() }));

const KEYS = ['prog', 'dsa', 'os', 'dbms', 'web', 'aiml', 'cn', 'sd', 'mobile'];
const domains = KEYS.map((key) => ({ key, label: `Domain ${key}` }));
const questionsFor = (key) => ['easy', 'medium', 'hard'].map((difficulty) => ({ id: `${key}-${difficulty}`, difficulty, question: `${key} ${difficulty} question`, options: ['A', 'B', 'C', 'D'] }));
const result = (extra = {}) => ({
  id: 'a1', name: 'Test Student', timestamp: '2026-01-05T10:00:00.000Z', timing: { limitSeconds: 1500, durationSeconds: 60, timedOut: false },
  profile: Object.fromEntries(KEYS.map((key) => [key, { label: `Domain ${key}`, band: 'Beginner', assessmentMethod: 'self-reported' }])), ...extra
});

// The page ignores a second click within 400 ms (to stop double-clicks skipping a domain); move the clock past it.
const wait = () => act(() => { vi.advanceTimersByTime(500); });
const click = (name) => { fireEvent.click(screen.getByRole('button', { name })); };
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  getDomains.mockResolvedValue(domains);
  sampleQuestions.mockImplementation(async (key) => questionsFor(key));
  submitAssessment.mockResolvedValue(result());
});
afterEach(() => { vi.useRealTimers(); });

async function start() {
  renderPage(<AssessmentPage />, { path: '/assessment' });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  click(/begin assessment/i);
  await wait();
}

const skipAll = async () => {
  for (let i = 0; i < KEYS.length; i++) {
    click(/no, total beginner/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  }
};

describe('assessment', () => {
  it('opens with the nine domains and a 25 minute timer, and says nothing about the question bank', async () => {
    renderPage(<AssessmentPage />, { path: '/assessment' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    for (const { label } of domains) expect(screen.getByText(label)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/in the bank|\d+\s*Qs|\bpool\b/i);
    click(/begin assessment/i);
    await wait();
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
    expect(screen.getAllByText(/Domain 1 of 9/).length).toBeGreaterThan(0);
  });

  it('skipping every domain records them as self-reported and shows the results', async () => {
    await start();
    await skipAll();
    expect(submitAssessment).toHaveBeenCalledTimes(1);
    const payload = submitAssessment.mock.calls[0][0];
    expect(payload.skippedDomains).toEqual(KEYS);
    expect(payload.shownQuestions).toEqual({});
    expect(payload.timing).toMatchObject({ limitSeconds: 1500, timedOut: false });
    expect(payload).not.toHaveProperty('userId'); // the server knows who is signed in; the browser never says who it is
    await flush();
    expect(screen.getByText(/here is your baseline/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /choose your goal/i })).toHaveAttribute('href', '/goal');
  });

  it('answers a quiz, sends the chosen option numbers, and marks unanswered questions as -1', async () => {
    await start();
    click(/^yes/i);
    await flush();
    expect(sampleQuestions).toHaveBeenCalledWith('prog');
    expect(screen.getByText('0 / 3 answered')).toBeInTheDocument();
    const list = screen.getByRole('list');
    fireEvent.click(within(list).getAllByRole('radio')[2]); // first question, option C
    expect(screen.getByText('1 / 3 answered')).toBeInTheDocument();
    expect(screen.getByText(/unanswered questions count as incorrect/i)).toBeInTheDocument();
    await wait(); // a real student takes longer than 400 ms to answer
    click(/next domain/i);
    await wait();
    for (let i = 1; i < KEYS.length; i++) { click(/no, total beginner/i); await act(async () => { await vi.advanceTimersByTimeAsync(500); }); }
    const payload = submitAssessment.mock.calls[0][0];
    expect(payload.skippedDomains).toEqual(KEYS.slice(1));
    const shown = payload.shownQuestions.prog;
    expect(shown).toHaveLength(3);
    expect(Object.values(payload.answers.prog).sort()).toEqual([-1, -1, 2]);
    expect(Object.keys(payload.answers.prog).sort()).toEqual([...shown].sort());
  });

  it('a double click cannot skip two domains', async () => {
    await start();
    const no = screen.getByRole('button', { name: /no, total beginner/i });
    fireEvent.click(no);
    fireEvent.click(no);
    await wait();
    expect(screen.getAllByText(/Domain 2 of 9/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Domain 3 of 9/)).not.toBeInTheDocument();
  });

  it('shows a clear message with Try again when the questions cannot be loaded', async () => {
    await start();
    sampleQuestions.mockRejectedValueOnce(new Error('Could not reach the server.'));
    click(/^yes/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
    click(/try again/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('0 / 3 answered')).toBeInTheDocument();
  });

  it('keeps the answers and offers a retry when submitting fails', async () => {
    submitAssessment.mockRejectedValueOnce(new Error('Could not save your results.'));
    await start();
    await skipAll();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your results.');
    click(/try again/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(submitAssessment).toHaveBeenCalledTimes(2);
    expect(submitAssessment.mock.calls[1][0].skippedDomains).toEqual(KEYS);
    expect(screen.getByText(/here is your baseline/i)).toBeInTheDocument();
  });

  it('submits what was answered when the 25 minutes run out, and says so', async () => {
    submitAssessment.mockResolvedValue(result({ timing: { limitSeconds: 1500, durationSeconds: 1500, timedOut: true } }));
    await start();
    click(/no, total beginner/i);
    await wait();
    click(/^yes/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(within(screen.getByRole('list')).getAllByRole('radio')[0]);
    await wait();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_501_000); });
    expect(submitAssessment).toHaveBeenCalledTimes(1);
    const payload = submitAssessment.mock.calls[0][0];
    expect(payload.timing.timedOut).toBe(true);
    expect(payload.skippedDomains).toEqual(['prog']);
    expect(Object.values(payload.answers.dsa)).toContain(0); // the question that was ticked before time ran out
    await flush();
    expect(screen.getAllByText(/time ran out/i).length).toBeGreaterThan(0);
  });

  it('cannot be submitted twice by the timer and a click at the same moment', async () => {
    await start();
    for (let i = 0; i < KEYS.length - 1; i++) { click(/no, total beginner/i); await act(async () => { await vi.advanceTimersByTimeAsync(500); }); }
    await act(async () => { await vi.advanceTimersByTimeAsync(1_501_000); });
    expect(submitAssessment).toHaveBeenCalledTimes(1);
  });
});
