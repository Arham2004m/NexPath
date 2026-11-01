import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoadmapPage from '../src/pages/RoadmapPage';
import ProgressPage from '../src/pages/ProgressPage';
import NodeDetails from '../src/components/roadmap/NodeDetails';
import WeeklyChart from '../src/components/progress/WeeklyChart';
import { getCurrentRoadmap, getDashboard, setKnownSkill, updateTopic } from '../src/services/roadmapApi';
import { getGoals } from '../src/services/goalApi';
import { catalog, makePlan, makeProgress, progressAfterT1 } from './fixtures';
import { deferred, renderPage } from './helpers';

vi.mock('../src/services/roadmapApi', () => ({ getCurrentRoadmap: vi.fn(), getDashboard: vi.fn(), updateTopic: vi.fn(), setKnownSkill: vi.fn() }));
vi.mock('../src/services/goalApi', () => ({ getGoals: vi.fn(), getRecommendations: vi.fn(), saveGoal: vi.fn() }));
// The React Flow canvas needs a real layout engine; the page logic around it is what these tests cover.
vi.mock('../src/components/roadmap/RoadmapTree', () => ({
  default: ({ roadmap, onSelect }) => <div data-testid="tree">{roadmap.nodes.map((node) => <button key={node.id} type="button" onClick={() => onSelect(node.id)}>{`skill: ${node.name}`}</button>)}</div>
}));

const saved = (overrides = {}) => ({ roadmap: { id: 'r1', version: 1, plan: makePlan(overrides.plan), ...overrides.roadmap }, progress: makeProgress(overrides.progress) });
const problem = (message, code) => Object.assign(new Error(message), { code });

beforeEach(() => { getGoals.mockResolvedValue(catalog); });

describe('roadmap page', () => {
  it('shows the saved roadmap with its overall progress', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    expect(await screen.findByText('0% done')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Web Developer, Frontend.');
    expect(screen.getByText(/0 of 3 topics in this plan/)).toBeInTheDocument();
    expect(within(await screen.findByTestId('tree')).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('progressbar', { name: /roadmap progress/i })).toHaveAttribute('aria-valuenow', '0');
  });

  it('lists the weeks with a tick box per topic', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    expect(screen.getByText('Semantic HTML')).toBeInTheDocument();
    expect(screen.getByText('ES6 fundamentals')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByText(/This week/)).toBeInTheDocument();
  });

  it('ticking a topic updates the percentage at once and keeps the server numbers', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    const pending = deferred();
    updateTopic.mockReturnValue(pending.promise);
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /mark as done: semantic html/i }));
    expect(screen.getByText('33% done')).toBeInTheDocument(); // before the server has answered
    expect(updateTopic).toHaveBeenCalledWith('t1', { done: true });
    pending.resolve({ progress: progressAfterT1(), roadmapChanged: false });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /mark as not done: semantic html/i })).toBeChecked());
    expect(screen.getByText('33% done')).toBeInTheDocument();
  });

  it('puts things back and says so when saving fails', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    updateTopic.mockRejectedValue(new Error('Could not save that tick.'));
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /mark as done: semantic html/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save that tick.');
    expect(screen.getByText('0% done')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /mark as done: semantic html/i })).not.toBeChecked();
  });

  it('sends quick tick and untick clicks in order and ends on the last answer', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    const first = deferred();
    const second = deferred();
    updateTopic.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /mark as done: semantic html/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /mark as not done: semantic html/i }));
    expect(updateTopic).toHaveBeenCalledTimes(1); // the second click waits for the first
    first.resolve({ progress: progressAfterT1(), roadmapChanged: false });
    await waitFor(() => expect(updateTopic).toHaveBeenCalledTimes(2));
    expect(updateTopic).toHaveBeenNthCalledWith(2, 't1', { done: false });
    second.resolve({ progress: makeProgress(), roadmapChanged: false });
    await waitFor(() => expect(screen.getByText('0% done')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: /mark as done: semantic html/i })).not.toBeChecked();
  });

  it('reloads the plan when un-ticking finished work from an earlier version changes it', async () => {
    const carried = { completedTopics: [{ topicId: 'old-1', nodeId: 'n1', title: 'Old finished topic', hours: 4 }] };
    getCurrentRoadmap.mockResolvedValue(saved({ plan: carried }));
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    expect(screen.getByText(/Finished before this version/)).toBeInTheDocument();
    expect(screen.getByText(/Old finished topic/)).toBeInTheDocument();
  });

  it('asks the student to choose a goal, or take the assessment, instead of showing an error', async () => {
    getCurrentRoadmap.mockRejectedValue(problem('Choose a goal first.', 'GOAL_REQUIRED'));
    const { unmount } = renderPage(<RoadmapPage />, { path: '/roadmap' });
    expect(await screen.findByRole('link', { name: /choose your goal/i })).toHaveAttribute('href', '/goal');
    unmount();
    getCurrentRoadmap.mockRejectedValue(problem('Take the assessment first.', 'ASSESSMENT_REQUIRED'));
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    expect(await screen.findByRole('link', { name: /begin assessment/i })).toHaveAttribute('href', '/assessment');
  });

  it('shows other failures with a working Try again', async () => {
    getCurrentRoadmap.mockRejectedValueOnce(new Error('Could not reach the server.')).mockResolvedValue(saved());
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('0% done')).toBeInTheDocument();
  });

  it('says so when a roadmap is finished', async () => {
    getCurrentRoadmap.mockResolvedValue(saved({ plan: { weeks: [], totalWeeks: 0, totalHours: 0 }, progress: { percentComplete: 100, pace: 'complete', topicsTotal: 0, topicsDone: 0, weekly: [] } }));
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    expect(await screen.findByText('100% done')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });
});

describe('skill details panel', () => {
  const plan = makePlan();
  const node = (id) => plan.nodes.find((n) => n.id === id);
  const props = (extra = {}) => ({ nameOf: (id) => id, progress: makeProgress(), onClose: vi.fn(), onToggleKnown: vi.fn(), onToggleTopic: vi.fn(), onLogTime: vi.fn(), busy: false, notice: null, ...extra });

  it('ticks a topic and logs time', async () => {
    const p = props();
    renderPage(<NodeDetails node={node('n1')} {...p} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /mark as done: semantic html/i }));
    expect(p.onToggleTopic).toHaveBeenCalledWith('t1', true);
    await userEvent.click(screen.getAllByText(/log time/i)[0]);
    await userEvent.type(screen.getAllByLabelText(/minutes spent/i)[0], '45');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    expect(p.onLogTime).toHaveBeenCalledWith('t1', 45);
  });

  it('ignores impossible minutes', async () => {
    const p = props();
    renderPage(<NodeDetails node={node('n1')} {...p} />);
    await userEvent.click(screen.getAllByText(/log time/i)[0]);
    const input = screen.getAllByLabelText(/minutes spent/i)[0];
    for (const value of ['0', '2000', '1.5']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.submit(input.closest('form'));
    }
    expect(p.onLogTime).not.toHaveBeenCalled();
  });

  it('offers to skip an ordinary skill but never the capstone', async () => {
    const p = props();
    const { unmount } = renderPage(<NodeDetails node={node('n1')} {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /i already know this/i }));
    expect(p.onToggleKnown).toHaveBeenCalledWith('n1', true);
    unmount();
    renderPage(<NodeDetails node={node('n2')} {...props()} />);
    expect(screen.queryByRole('button', { name: /i already know this/i })).not.toBeInTheDocument();
    expect(screen.getByText(/final hands-on skill/i)).toBeInTheDocument();
  });

  it('explains why a skill was skipped and lets a self-marked one be undone', async () => {
    const { unmount } = renderPage(<NodeDetails node={node('n0')} {...props()} />);
    expect(screen.getByText(/skipped because of your assessment/i)).toBeInTheDocument();
    unmount();
    const p = props();
    renderPage(<NodeDetails node={{ ...node('n0'), source: 'self' }} {...p} />);
    expect(screen.getByText(/marked as known by you/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /i do not know this yet/i }));
    expect(p.onToggleKnown).toHaveBeenCalledWith('n0', false);
  });

  it('lets finished work from an earlier version be un-ticked', async () => {
    const finished = { ...node('n1'), topics: [{ id: 'old-1', title: 'Old topic', hours: 4, done: true }, node('n1').topics[1]] };
    const p = props();
    renderPage(<NodeDetails node={finished} {...p} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /mark as not done: old topic/i }));
    expect(p.onToggleTopic).toHaveBeenCalledWith('old-1', false);
  });

  it('closes with Escape', async () => {
    const p = props();
    renderPage(<NodeDetails node={node('n1')} {...p} />);
    await userEvent.keyboard('{Escape}');
    expect(p.onClose).toHaveBeenCalled();
  });
});

describe('progress page', () => {
  const dashboard = (progress = {}) => ({
    roadmap: { goalId: 'web_dev', subTrack: 'frontend', startDate: '2026-01-05', endDate: '2026-01-18', totalWeeks: 2, totalHours: 12 },
    progress: makeProgress(progress)
  });

  it('shows the headline, pace, weekly chart and what is next', async () => {
    getDashboard.mockResolvedValue(dashboard({ percentComplete: 33, doneHours: 4, topicsDone: 1, pace: 'on_track', lagWeeks: 0 }));
    renderPage(<ProgressPage />, { path: '/progress' });
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('33% of your roadmap is done.');
    expect(screen.getByText(/1 of 3 topics in the current plan/)).toBeInTheDocument();
    expect(screen.getByText('On track.')).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: /weekly progress chart/i })).toBeInTheDocument();
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.getByText('Week 1 of 2')).toBeInTheDocument();
  });

  it('is honest before the first week has ended', async () => {
    getDashboard.mockResolvedValue(dashboard());
    renderPage(<ProgressPage />, { path: '/progress' });
    expect(await screen.findByText('Just getting started.')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
  });

  it('flags overdue topics and a behind pace in plain words', async () => {
    getDashboard.mockResolvedValue(dashboard({ pace: 'behind', lagWeeks: 2.4, weeksEnded: 3, velocity: 0.4, nextUp: [{ topicId: 't1', nodeId: 'n1', nodeName: 'HTML', title: 'Semantic HTML', hours: 4, week: 1, overdue: true }], topicStatus: { t1: 'overdue' } }));
    renderPage(<ProgressPage />, { path: '/progress' });
    expect(await screen.findByText('Behind schedule.')).toBeInTheDocument();
    expect(screen.getByText(/About 2.4 weeks/)).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('ticks a topic from the up-next list and shows the new numbers', async () => {
    getDashboard.mockResolvedValue(dashboard());
    updateTopic.mockResolvedValue({ progress: progressAfterT1(), roadmapChanged: false });
    renderPage(<ProgressPage />, { path: '/progress' });
    await userEvent.click(await screen.findByRole('checkbox', { name: /mark as done: semantic html/i }));
    expect(await screen.findByText('33% of your roadmap is done.')).toBeInTheDocument();
  });

  it('shows the error from a failed tick without losing the page', async () => {
    getDashboard.mockResolvedValue(dashboard());
    updateTopic.mockRejectedValue(new Error('Could not save that tick.'));
    renderPage(<ProgressPage />, { path: '/progress' });
    await userEvent.click(await screen.findByRole('checkbox', { name: /mark as done: semantic html/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save that tick.');
    expect(screen.getByText('0% of your roadmap is done.')).toBeInTheDocument();
  });

  it('reloads when un-ticking changes the plan', async () => {
    getDashboard.mockResolvedValue(dashboard());
    updateTopic.mockResolvedValue({ progress: makeProgress(), roadmapChanged: true });
    renderPage(<ProgressPage />, { path: '/progress' });
    await userEvent.click(await screen.findByRole('checkbox', { name: /mark as done: semantic html/i }));
    await waitFor(() => expect(getDashboard).toHaveBeenCalledTimes(2));
  });

  it('points to the goal or assessment when there is nothing to show yet', async () => {
    getDashboard.mockRejectedValue(problem('Choose a goal first.', 'GOAL_REQUIRED'));
    renderPage(<ProgressPage />, { path: '/progress' });
    expect(await screen.findByRole('link', { name: /choose your goal/i })).toBeInTheDocument();
  });

  it('handles a roadmap with nothing left to do', async () => {
    getDashboard.mockResolvedValue(dashboard({ percentComplete: 100, pace: 'complete', topicsTotal: 0, totalWeeks: 0, weekly: [], nextUp: [], topicStatus: {} }));
    renderPage(<ProgressPage />, { path: '/progress' });
    expect(await screen.findByText('100% of your roadmap is done.')).toBeInTheDocument();
    expect(screen.getByText(/nothing left|no topics/i)).toBeInTheDocument();
  });
});

describe('weekly chart', () => {
  const weekly = makeProgress().weekly;

  it('has one focusable column per week with the numbers in its label', () => {
    renderPage(<WeeklyChart weekly={weekly} />);
    const columns = within(screen.getByRole('group', { name: /weekly progress chart/i })).getAllByRole('button');
    expect(columns).toHaveLength(2);
    expect(columns[0]).toHaveAccessibleName(/Week 1.*0 of 7 planned hours done/);
  });

  it('shows details on hover and every value in the table view', async () => {
    renderPage(<WeeklyChart weekly={[{ ...weekly[0], completedHours: 4, completionRate: 0.57, minutesLogged: 90 }, weekly[1]]} />);
    await userEvent.hover(screen.getAllByRole('button', { name: /^Week/ })[0]);
    expect(screen.getByText(/4 of 7 h done \(57%\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 h 30 min logged/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /view as table/i }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('1 h 30 min')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /view as chart/i }));
    expect(screen.getByRole('group', { name: /weekly progress chart/i })).toBeInTheDocument();
  });

  it('is a single Tab stop and arrow keys move between weeks', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...weekly[0], index: i + 1, state: i === 4 ? 'current' : 'upcoming' }));
    renderPage(<WeeklyChart weekly={many} />);
    const columns = screen.getAllByRole('button', { name: /^Week/ });
    expect(columns.filter((c) => c.tabIndex === 0)).toHaveLength(1);
    expect(columns[4].tabIndex).toBe(0); // the current week
    columns[4].focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(columns[6]).toHaveFocus();
    expect(screen.getByText(/Week 7/)).toBeInTheDocument();
    await userEvent.keyboard('{Home}');
    expect(columns[0]).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(columns[29]).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(columns[29]).toHaveFocus(); // stops at the end
  });

  it('copes with no weeks and with a hundred weeks', () => {
    const { unmount } = renderPage(<WeeklyChart weekly={[]} />);
    expect(screen.getByText(/no weeks left/i)).toBeInTheDocument();
    unmount();
    const many = Array.from({ length: 110 }, (_, i) => ({ ...weekly[0], index: i + 1, state: i === 40 ? 'current' : 'upcoming' }));
    renderPage(<WeeklyChart weekly={many} />);
    expect(screen.getAllByRole('button', { name: /^Week/ })).toHaveLength(110);
  });
});

describe('working through the skill tree', () => {
  const openSkill = async (name) => userEvent.click(await screen.findByRole('button', { name: `skill: ${name}` }));

  it('opens a skill, ticks a topic from the panel and updates the whole page', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    updateTopic.mockResolvedValue({ progress: progressAfterT1(), roadmapChanged: false });
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await openSkill('HTML and CSS');
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('Semantic HTML')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('checkbox', { name: /mark as done: semantic html/i }));
    expect(await screen.findByText('33% done')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('checkbox', { name: /mark as not done: semantic html/i })).toBeChecked();
  });

  it('marking a skill as known regenerates the roadmap and keeps the panel open', async () => {
    const afterKnown = saved({ plan: { totalHours: 5, totalWeeks: 1, nodes: makePlan().nodes.map((n) => (n.id === 'n1' ? { ...n, status: 'mastered', source: 'self' } : n)) } });
    getCurrentRoadmap.mockResolvedValueOnce(saved()).mockResolvedValueOnce(afterKnown);
    setKnownSkill.mockResolvedValue({ knownSkills: ['n1'] });
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await openSkill('HTML and CSS');
    await userEvent.click(screen.getByRole('button', { name: /i already know this/i }));
    expect(setKnownSkill).toHaveBeenCalledWith('n1', true);
    expect(await screen.findByText(/marked as known by you/i)).toBeInTheDocument();
    expect(getCurrentRoadmap).toHaveBeenCalledTimes(2);
  });

  it('shows why marking a skill failed and leaves everything as it was', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    setKnownSkill.mockRejectedValue(new Error('This is the final hands-on skill of your path, so it cannot be skipped.'));
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await openSkill('HTML and CSS');
    await userEvent.click(screen.getByRole('button', { name: /i already know this/i }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/cannot be skipped/);
    expect(getCurrentRoadmap).toHaveBeenCalledTimes(1);
  });
});

describe('week list on a phone', () => {
  it('logs time on a topic without opening the skill panel', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    updateTopic.mockResolvedValue({ progress: makeProgress({ loggedHours: 0.75, minutesByTopic: { t1: 45 } }), roadmapChanged: false });
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    await userEvent.click(screen.getAllByText(/log time/i)[0]);
    await userEvent.type(screen.getAllByLabelText(/minutes spent/i)[0], '45');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    expect(updateTopic).toHaveBeenCalledWith('t1', { minutesSpent: 45 });
    expect(await screen.findByText(/45 min so far/)).toBeInTheDocument();
  });

  it('opens a skill from its name, so it can be marked as known without the tree', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    await userEvent.click(screen.getAllByRole('button', { name: 'HTML and CSS' })[0]);
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByRole('button', { name: /i already know this/i })).toBeInTheDocument();
  });

  it('never gives two form fields the same id when a topic shows in the list and the panel', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    await userEvent.click(screen.getAllByRole('button', { name: 'HTML and CSS' })[0]);
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
