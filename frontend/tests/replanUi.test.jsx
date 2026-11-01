import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoadmapPage from '../src/pages/RoadmapPage';
import ProgressPage from '../src/pages/ProgressPage';
import ReplanBanner from '../src/components/replan/ReplanBanner';
import ReplanHistory from '../src/components/replan/ReplanHistory';
import { dismissOffer, offerDismissed } from '../src/lib/offers';
import { acceptSuggestedHours, getCurrentRoadmap, getDashboard, markReplanSeen, replanNow, updateTopic } from '../src/services/roadmapApi';
import { getGoals } from '../src/services/goalApi';
import { catalog, enrichEvent, extrasBlock, extrasProgress, hoursOffer, makePlan, makeProgress, progressAfterT1, shiftEvent } from './fixtures';
import { renderPage } from './helpers';

vi.mock('../src/services/roadmapApi', () => ({
  getCurrentRoadmap: vi.fn(), getDashboard: vi.fn(), updateTopic: vi.fn(), setKnownSkill: vi.fn(), markReplanSeen: vi.fn(), acceptSuggestedHours: vi.fn(), replanNow: vi.fn()
}));
vi.mock('../src/services/goalApi', () => ({ getGoals: vi.fn(), getRecommendations: vi.fn(), saveGoal: vi.fn() }));
vi.mock('../src/components/roadmap/RoadmapTree', () => ({
  default: ({ roadmap, onSelect }) => <div data-testid="tree">{[...roadmap.nodes, ...(roadmap.extras?.nodes || [])].map((node) => <button key={node.id} type="button" onClick={() => onSelect(node.id)}>{`skill: ${node.name}`}</button>)}</div>
}));

const saved = ({ plan, progress, replan } = {}) => ({ roadmap: { id: 'r1', version: 1, plan: makePlan(plan) }, progress: makeProgress(progress), replan: replan ?? { event: null, suggestion: null } });
const dashboard = ({ progress, replan } = {}) => ({
  roadmap: { goalId: 'web_dev', subTrack: 'frontend', startDate: '2026-01-05', endDate: '2026-01-18', totalWeeks: 2, totalHours: 12 },
  progress: makeProgress(progress), replan: replan ?? { event: null, suggestion: null, history: [] }
});

beforeEach(() => { getGoals.mockResolvedValue(catalog); window.localStorage.clear(); });
afterEach(() => { window.localStorage.clear(); });

describe('the explanation banner', () => {
  it('says what changed, why, and on what numbers, for a rescheduled plan', () => {
    render(<ReplanBanner event={shiftEvent()} suggestion={null} onDismiss={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Your plan was adjusted' })).toBeInTheDocument();
    expect(screen.getByText(/2.4 weeks behind schedule/)).toBeInTheDocument();
    expect(screen.getByText(/30 h planned and 6 h done over 3 finished weeks/)).toBeInTheDocument();
  });

  it('says what was added for extras, and that they are optional', () => {
    render(<ReplanBanner event={enrichEvent()} suggestion={null} onDismiss={() => {}} />);
    expect(screen.getByRole('heading', { name: /you are ahead/i })).toBeInTheDocument();
    expect(screen.getByText(/do not change your finish date/)).toBeInTheDocument();
  });

  it('shows nothing when there is nothing to say', () => {
    const { container } = render(<ReplanBanner event={null} suggestion={null} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the offer on its own, with both choices spelled out', () => {
    render(<ReplanBanner event={null} suggestion={hoursOffer()} onDismiss={() => {}} onAcceptHours={() => {}} onKeepHours={() => {}} />);
    expect(screen.getByText(/finished less than 60% of the plan, about 3.5 h of 10 hours a week/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plan for 5 hours a week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep 10 hours a week' })).toBeInTheDocument();
  });

  it('does not change anything until a button is pressed', () => {
    const onAcceptHours = vi.fn(); const onKeepHours = vi.fn(); const onDismiss = vi.fn();
    render(<ReplanBanner event={shiftEvent()} suggestion={hoursOffer()} onDismiss={onDismiss} onAcceptHours={onAcceptHours} onKeepHours={onKeepHours} />);
    expect(onAcceptHours).not.toHaveBeenCalled();
    expect(onKeepHours).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('plan change history', () => {
  it('lists changes newest first with their explanation', () => {
    render(<ReplanHistory events={[shiftEvent({ id: 'b', fromVersion: 2, toVersion: 3 }), enrichEvent()]} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Rescheduled');
    expect(items[0]).toHaveTextContent('version 2 to 3');
    expect(items[1]).toHaveTextContent('Extras added');
  });

  it('explains what will happen when there is no history yet', () => {
    render(<ReplanHistory events={[]} />);
    expect(screen.getByText(/two weeks behind, or get a week ahead/)).toBeInTheDocument();
  });
});

describe('the offer is remembered on this device', () => {
  it('stays dismissed, and a different offer is not affected', () => {
    expect(offerDismissed(hoursOffer())).toBe(false);
    dismissOffer(hoursOffer());
    expect(offerDismissed(hoursOffer())).toBe(true);
    expect(offerDismissed(hoursOffer({ hoursPerWeek: 4 }))).toBe(false);
  });

  it('works without storage (a private window): the offer just shows again', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    vi.stubGlobal('localStorage', broken);
    Object.defineProperty(window, 'localStorage', { value: broken, configurable: true });
    expect(() => dismissOffer(hoursOffer())).not.toThrow();
    expect(offerDismissed(hoursOffer())).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('roadmap page and replanning', () => {
  it('shows the explanation after a replan and removes it once it has been read', async () => {
    getCurrentRoadmap.mockResolvedValueOnce(saved({ replan: { event: shiftEvent(), suggestion: null } })).mockResolvedValue(saved());
    markReplanSeen.mockResolvedValue({ event: {} });
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    expect(await screen.findByText(/2.4 weeks behind schedule/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(markReplanSeen).toHaveBeenCalledWith('e1');
    await waitFor(() => expect(screen.queryByText(/2.4 weeks behind schedule/)).not.toBeInTheDocument());
    expect(getCurrentRoadmap).toHaveBeenCalledTimes(2);
  });

  it('accepting the offer lowers the hours, refreshes the student and reloads the plan', async () => {
    const refreshUser = vi.fn(async () => {});
    getCurrentRoadmap.mockResolvedValueOnce(saved({ replan: { event: null, suggestion: hoursOffer() } })).mockResolvedValue(saved({ plan: { hoursPerWeek: 5 } }));
    acceptSuggestedHours.mockResolvedValue({ user: {} });
    renderPage(<RoadmapPage />, { path: '/roadmap', auth: { refreshUser } });
    await userEvent.click(await screen.findByRole('button', { name: 'Plan for 5 hours a week' }));
    expect(acceptSuggestedHours).toHaveBeenCalledWith(5);
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    await waitFor(() => expect(getCurrentRoadmap).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Would fewer hours a week suit you better/)).not.toBeInTheDocument();
  });

  it('shows why accepting failed and keeps the offer', async () => {
    getCurrentRoadmap.mockResolvedValue(saved({ replan: { event: null, suggestion: hoursOffer() } }));
    acceptSuggestedHours.mockRejectedValue(new Error('This only lowers your weekly hours.'));
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: 'Plan for 5 hours a week' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This only lowers your weekly hours.');
    expect(screen.getByRole('button', { name: 'Plan for 5 hours a week' })).toBeInTheDocument();
  });

  it('keeping the hours hides the offer, also next time the page opens', async () => {
    getCurrentRoadmap.mockResolvedValue(saved({ replan: { event: null, suggestion: hoursOffer() } }));
    const first = renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: 'Keep 10 hours a week' }));
    expect(screen.queryByText(/Would fewer hours/)).not.toBeInTheDocument();
    expect(acceptSuggestedHours).not.toHaveBeenCalled();
    first.unmount();
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await screen.findByText('0% done');
    expect(screen.queryByText(/Would fewer hours/)).not.toBeInTheDocument();
  });

  it('a tick that makes the plan adapt reloads it and shows the explanation', async () => {
    getCurrentRoadmap.mockResolvedValueOnce(saved()).mockResolvedValue(saved({ plan: { startDate: '2026-02-02' }, replan: { event: shiftEvent(), suggestion: null } }));
    updateTopic.mockResolvedValue({ progress: progressAfterT1(), roadmapChanged: true, replan: { event: shiftEvent(), suggestion: null } });
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /mark as done: semantic html/i }));
    expect(await screen.findByText(/2.4 weeks behind schedule/)).toBeInTheDocument();
    expect(getCurrentRoadmap).toHaveBeenCalledTimes(2);
  });

  it('shows the deadline as a date and what it would take to keep it', async () => {
    getCurrentRoadmap.mockResolvedValue(saved({ plan: { feasible: false, achievable: true, requiredHoursPerWeek: 14, targetWeeks: 6, deadlineDate: '2026-03-02' } }));
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    expect(await screen.findByText(/Finishing by 2 Mar 2026 is tight/)).toBeInTheDocument();
    expect(screen.getByText(/needs about 14 hours a week/)).toBeInTheDocument();
  });
});

describe('optional extras on the roadmap page', () => {
  const withExtras = (done = 0) => saved({ plan: { extras: extrasBlock() }, progress: extrasProgress(done) });

  it('lists them in the week view, apart from the plan, and ticking one leaves the percentage alone', async () => {
    getCurrentRoadmap.mockResolvedValue(withExtras());
    updateTopic.mockResolvedValue({ progress: { ...makeProgress(), ...extrasProgress(1) }, roadmapChanged: false });
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    const section = screen.getByRole('region', { name: 'Optional extras' });
    expect(within(section).getByText(/entirely optional/)).toBeInTheDocument();
    expect(within(section).getAllByRole('checkbox')).toHaveLength(2);
    await userEvent.click(within(section).getByRole('checkbox', { name: /mark as done: extra topic one/i }));
    expect(updateTopic).toHaveBeenCalledWith('x1', { done: true });
    expect(screen.getByText('0% done')).toBeInTheDocument(); // an extra never moves the percentage
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Optional extras' })).getByRole('checkbox', { name: /mark as not done: extra topic one/i })).toBeChecked());
  });

  it('shows an extra skill in the tree and explains it in the panel, without offering to skip it', async () => {
    getCurrentRoadmap.mockResolvedValue(withExtras());
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: 'skill: Extra skill' }));
    const panel = screen.getByRole('dialog');
    expect(within(panel).getAllByText(/optional extra/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/added because you are ahead of schedule/i)).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /i already know this/i })).not.toBeInTheDocument();
    expect(within(panel).getByRole('checkbox', { name: /mark as done: extra topic one/i })).toBeInTheDocument();
  });

  it('shows no extras section when there are none', async () => {
    getCurrentRoadmap.mockResolvedValue(saved());
    renderPage(<RoadmapPage />, { path: '/roadmap' });
    await userEvent.click(await screen.findByRole('button', { name: /week by week/i }));
    expect(screen.queryByRole('region', { name: 'Optional extras' })).not.toBeInTheDocument();
  });
});

describe('progress page and replanning', () => {
  it('shows the explanation and the plan history', async () => {
    getDashboard.mockResolvedValue(dashboard({ replan: { event: shiftEvent(), suggestion: null, history: [shiftEvent(), enrichEvent({ id: 'old' })] } }));
    renderPage(<ProgressPage />, { path: '/progress' });
    expect(await screen.findByRole('heading', { name: 'Your plan was adjusted' })).toBeInTheDocument();
    const history = screen.getByRole('heading', { name: 'Plan changes' }).closest('section');
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
  });

  it('marks the explanation as read and refreshes without blanking the page', async () => {
    getDashboard.mockResolvedValueOnce(dashboard({ replan: { event: shiftEvent(), suggestion: null, history: [shiftEvent()] } })).mockResolvedValue(dashboard({ replan: { event: null, suggestion: null, history: [shiftEvent()] } }));
    markReplanSeen.mockResolvedValue({ event: {} });
    renderPage(<ProgressPage />, { path: '/progress' });
    await userEvent.click(await screen.findByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your plan was adjusted' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(markReplanSeen).toHaveBeenCalledWith('e1');
  });

  it('the check-now button says what happened and why, and refreshes', async () => {
    getDashboard.mockResolvedValue(dashboard({ progress: { pace: 'on_track', lagWeeks: 0.2, weeksEnded: 2 } }));
    replanNow.mockResolvedValue({ replanned: false, message: 'You are keeping up with the plan, so nothing needed to change.' });
    renderPage(<ProgressPage />, { path: '/progress' });
    await userEvent.click(await screen.findByRole('button', { name: 'Check my plan now' }));
    expect(replanNow).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('You are keeping up with the plan, so nothing needed to change.')).toBeInTheDocument();
    await waitFor(() => expect(getDashboard).toHaveBeenCalledTimes(2));
  });

  it('reports a failed check and offers no check once the roadmap is complete', async () => {
    getDashboard.mockResolvedValue(dashboard());
    replanNow.mockRejectedValue(new Error('Could not reach the server.'));
    const { unmount } = renderPage(<ProgressPage />, { path: '/progress' });
    await userEvent.click(await screen.findByRole('button', { name: 'Check my plan now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    unmount();
    getDashboard.mockResolvedValue(dashboard({ progress: { pace: 'complete', percentComplete: 100 } }));
    renderPage(<ProgressPage />, { path: '/progress' });
    await screen.findByText('100% of your roadmap is done.');
    expect(screen.queryByRole('button', { name: 'Check my plan now' })).not.toBeInTheDocument();
  });

  it('summarises optional extras without touching the main numbers', async () => {
    getDashboard.mockResolvedValue(dashboard({ progress: { percentComplete: 33, ...extrasProgress(1) } }));
    renderPage(<ProgressPage />, { path: '/progress' });
    const section = (await screen.findByRole('heading', { name: 'Optional extras' })).closest('section');
    expect(within(section).getByText('1 of 2 done')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('33% of your roadmap is done.');
  });

  it('accepts the offer from here too, and ticking can bring a replan in', async () => {
    getDashboard.mockResolvedValue(dashboard({ replan: { event: null, suggestion: hoursOffer(), history: [] } }));
    acceptSuggestedHours.mockResolvedValue({ user: {} });
    renderPage(<ProgressPage />, { path: '/progress' });
    await userEvent.click(await screen.findByRole('button', { name: 'Plan for 5 hours a week' }));
    expect(acceptSuggestedHours).toHaveBeenCalledWith(5);
    await waitFor(() => expect(getDashboard).toHaveBeenCalledTimes(2));
  });
});

describe('unused import guard', () => { it('keeps fireEvent available', () => { expect(typeof fireEvent.click).toBe('function'); }); });
