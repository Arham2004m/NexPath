import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GoalPage from '../src/pages/GoalPage';
import HomePage from '../src/pages/HomePage';
import AssessmentIntro from '../src/components/assessment/AssessmentIntro';
import ProtectedRoute from '../src/components/common/ProtectedRoute';
import { AuthProvider } from '../src/context/AuthContext';
import useAuth from '../src/hooks/useAuth';
import { request, setAccessToken } from '../src/services/api';
import { getGoals, getRecommendations, saveGoal } from '../src/services/goalApi';
import { getLatestAttempt } from '../src/services/assessmentApi';
import { getDashboard } from '../src/services/roadmapApi';
import { catalog, makeProgress } from './fixtures';
import { renderPage, student } from './helpers';

vi.mock('../src/services/goalApi', () => ({ getGoals: vi.fn(), getRecommendations: vi.fn(), saveGoal: vi.fn() }));
vi.mock('../src/services/assessmentApi', () => ({ getLatestAttempt: vi.fn(), getDomains: vi.fn(), sampleQuestions: vi.fn(), submitAssessment: vi.fn() }));
vi.mock('../src/services/roadmapApi', () => ({ getDashboard: vi.fn(), getCurrentRoadmap: vi.fn(), updateTopic: vi.fn(), setKnownSkill: vi.fn() }));

const attempt = { id: 'a1', profile: { web: { label: 'Web Development', assessmentMethod: 'tested', normalized: 0.5, band: 'Intermediate' } } };
const recommendations = [
  { goalId: 'faang', score: 0.7, match: 'Strong match', reasons: ['Builds on your DSA (Advanced)'], suggestedSubTrack: null },
  { goalId: 'web_dev', score: 0.6, match: 'Good match', reasons: ['Builds on your Web (Intermediate)'], suggestedSubTrack: 'frontend' }
];

beforeEach(() => {
  getGoals.mockResolvedValue(catalog);
  getRecommendations.mockResolvedValue(recommendations);
  getLatestAttempt.mockResolvedValue(attempt);
  getDashboard.mockRejectedValue(new Error('no roadmap yet'));
});

const helpText = () => document.getElementById('hours-help').textContent;
const chooseGoalCard = async (name) => userEvent.click(await screen.findByRole('radio', { name }));

describe('goal page', () => {
  const renderGoal = (props = {}) => renderPage(<GoalPage />, { path: '/goal', routes: [{ path: '/roadmap', text: 'ROADMAP PAGE' }, { path: '/assessment', text: 'ASSESSMENT PAGE' }], ...props });

  it('lists the goals with honest effort and the recommendations', async () => {
    renderGoal();
    expect(await screen.findByRole('radio', { name: /GATE \/ M\.Tech/ })).toHaveTextContent('≈ 330 h · about 34 weeks at 10 h/week');
    expect(screen.getByRole('radio', { name: /Web Developer/ })).toHaveTextContent('depending on track');
    expect(screen.getByText('Recommended for you')).toBeInTheDocument();
    expect(screen.getByText(/Builds on your DSA \(Advanced\)/)).toBeInTheDocument();
  });

  it('the weeks under the slider follow the hours for every goal', async () => {
    renderGoal();
    await chooseGoalCard(/GATE \/ M\.Tech/);
    const slider = screen.getByRole('slider');
    expect(helpText()).toContain('about 34 weeks at 10 h/week');
    for (const [hours, weeks] of [[3, 110], [20, 18], [40, 9]]) {
      fireEvent.change(slider, { target: { value: String(hours) } });
      expect(helpText(), `${hours} h`).toContain(`about ${weeks} weeks at ${hours} h/week`);
    }
  });

  it('shows a range for Web until a sub-track is chosen, then the exact weeks', async () => {
    renderGoal();
    await chooseGoalCard(/Web Developer/);
    expect(helpText()).toContain('about 11–26 weeks at 10 h/week depending on the track you pick');
    await userEvent.click(screen.getByRole('radio', { name: /Full Stack/ }));
    expect(helpText()).toContain('about 26 weeks at 10 h/week');
    expect(helpText()).not.toContain('depending');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
    expect(helpText()).toContain('about 7 weeks at 40 h/week');
  });

  it('never implies the length is fixed: no estimate mentions hours other than the chosen ones', async () => {
    renderGoal();
    await chooseGoalCard(/Product Company/);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '25' } });
    expect(helpText()).not.toMatch(/at 10 h\/week/);
  });

  it('a recommendation pre-fills its goal and suggested sub-track', async () => {
    renderGoal();
    const buttons = await screen.findAllByRole('button', { name: /choose this goal/i });
    await userEvent.click(buttons[1]); // Web Developer
    expect(screen.getByRole('radio', { name: /^Frontend/ })).toBeChecked();
    expect(helpText()).toContain('about 11 weeks at 10 h/week');
  });

  it('saves the chosen hours as a number and goes straight to the roadmap', async () => {
    saveGoal.mockResolvedValue({ user: {}, warning: null });
    renderGoal();
    await chooseGoalCard(/GATE \/ M\.Tech/);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '20' } });
    await userEvent.click(screen.getByRole('button', { name: /save goal and view roadmap/i }));
    expect(saveGoal).toHaveBeenCalledWith({ goalId: 'gate', subTrack: undefined, hoursPerWeek: 20, targetWeeks: undefined });
    expect(typeof saveGoal.mock.calls[0][0].hoursPerWeek).toBe('number');
    expect(await screen.findByText('ROADMAP PAGE')).toBeInTheDocument();
  });

  it('sends the target weeks when given, and shows a field error from the server', async () => {
    saveGoal.mockRejectedValue(Object.assign(new Error('Please correct the highlighted fields'), { errors: { subTrack: 'Choose a sub-track for this goal' } }));
    renderGoal();
    await chooseGoalCard(/Web Developer/);
    await userEvent.type(screen.getByLabelText(/target weeks/i), '16');
    await userEvent.click(screen.getByRole('button', { name: /save goal and view roadmap/i }));
    expect(saveGoal).toHaveBeenCalledWith(expect.objectContaining({ goalId: 'web_dev', targetWeeks: 16 }));
    expect(await screen.findByText('Choose a sub-track for this goal')).toBeInTheDocument();
    expect(screen.queryByText('ROADMAP PAGE')).not.toBeInTheDocument();
  });

  it('keeps the student on the page and shows a message when saving fails', async () => {
    saveGoal.mockRejectedValue(new Error('Could not reach the server.'));
    renderGoal();
    await chooseGoalCard(/GATE \/ M\.Tech/);
    await userEvent.click(screen.getByRole('button', { name: /save goal and view roadmap/i }));
    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
  });

  it('starts from the saved goal and hours and offers a link to the current roadmap', async () => {
    renderGoal({ user: { ...student, goalId: 'gate', hoursPerWeek: 20 } });
    expect(await screen.findByRole('radio', { name: /GATE \/ M\.Tech/ })).toBeChecked();
    expect(screen.getByRole('slider')).toHaveValue('20');
    expect(screen.getByRole('button', { name: /update goal and view roadmap/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view current roadmap/i })).toHaveAttribute('href', '/roadmap');
  });

  it('sends a student without an assessment to take it first', async () => {
    getLatestAttempt.mockResolvedValue(null);
    renderGoal();
    expect(await screen.findByText('ASSESSMENT PAGE')).toBeInTheDocument();
  });
});

describe('assessment intro', () => {
  it('describes the test format but never the size of the question bank', () => {
    render(<AssessmentIntro firstName="Asha" domains={[{ key: 'web', label: 'Web Development' }, { key: 'os', label: 'Operating Systems' }]} loading={false} minutes={25} onStart={() => {}} />);
    expect(screen.getByText(/three questions per domain/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/in the bank|\d+\s*Qs|\bpool\b/i);
    expect(screen.getByRole('button', { name: /begin assessment/i })).toBeEnabled();
  });
});

describe('home page', () => {
  const renderHome = (user = student) => renderPage(<HomePage />, { path: '/home', user });

  it('points a new student to the assessment, then to goal selection', async () => {
    getLatestAttempt.mockResolvedValue(null);
    const { unmount } = renderHome();
    expect(await screen.findByRole('link', { name: /begin assessment/i })).toHaveAttribute('href', '/assessment');
    unmount();
    getLatestAttempt.mockResolvedValue(attempt);
    renderHome();
    expect(await screen.findByRole('link', { name: /choose your goal/i })).toHaveAttribute('href', '/goal');
  });

  it('shows the real percentage and links once a roadmap exists', async () => {
    getDashboard.mockResolvedValue({ roadmap: {}, progress: makeProgress({ percentComplete: 33 }) });
    renderHome({ ...student, goalId: 'gate', hoursPerWeek: 10 });
    expect(await screen.findByText('33% done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see your progress/i })).toHaveAttribute('href', '/progress');
    expect(screen.queryByRole('link', { name: /begin assessment|choose your goal/i })).not.toBeInTheDocument();
  });

  it('lists what to do next with a link to the mentor once a roadmap exists', async () => {
    getDashboard.mockResolvedValue({ roadmap: {}, progress: makeProgress({ pace: 'behind', lagWeeks: 2.4 }) });
    renderHome({ ...student, goalId: 'gate', hoursPerWeek: 10 });
    expect(await screen.findByRole('heading', { name: 'What to do next.' })).toBeInTheDocument();
    expect(screen.getByText('Semantic HTML')).toBeInTheDocument();
    expect(screen.getByText('Flexbox and grid')).toBeInTheDocument();
    expect(screen.getByText(/Behind schedule/)).toBeInTheDocument();
    expect(screen.getByText(/Week 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ask the AI mentor' })).toHaveAttribute('href', '/mentor');
    expect(screen.queryByText(/A path takes shape/)).not.toBeInTheDocument();
  });

  it('keeps the welcome text while there is no roadmap yet', async () => {
    getDashboard.mockRejectedValue(new Error('none'));
    renderHome();
    expect(await screen.findByText(/A path takes shape/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What to do next.' })).not.toBeInTheDocument();
  });
});

describe('session handling', () => {
  function Probe() {
    const { logout } = useAuth();
    return (
      <div>
        <p>SECRET AREA</p>
        <button type="button" onClick={() => request('/data').catch(() => {})}>load data</button>
        <button type="button" onClick={logout}>log out</button>
      </div>
    );
  }
  const app = () => render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<ProtectedRoute><Probe /></ProtectedRoute>} />
          <Route path="/login" element={<p>LOGIN PAGE</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  it('sends the student back to sign in when the session can no longer be renewed', async () => {
    let signedIn = true;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('/auth/refresh')) return signedIn ? reply(200, { accessToken: 't1', user: { id: 'u1', name: 'A' } }) : reply(401, {});
      return reply(401, { message: 'expired' });
    }));
    setAccessToken(null);
    app();
    expect(await screen.findByText('SECRET AREA')).toBeInTheDocument();
    signedIn = false; // the refresh cookie has expired
    await userEvent.click(screen.getByRole('button', { name: /load data/i }));
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('redirects someone who is not signed in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(401, {})));
    setAccessToken(null);
    app();
    await waitFor(() => expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument());
    expect(screen.queryByText('SECRET AREA')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
