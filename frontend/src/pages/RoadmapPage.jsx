import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, Network } from 'lucide-react';
import Sidebar from '../components/home/Sidebar';
import Topbar from '../components/home/Topbar';
import RoadmapBlocker from '../components/roadmap/RoadmapBlocker';
import RoadmapSummary from '../components/roadmap/RoadmapSummary';
import ReplanBanner from '../components/replan/ReplanBanner';
import NodeDetails from '../components/roadmap/NodeDetails';
import WeekList from '../components/roadmap/WeekList';
import { getGoals } from '../services/goalApi';
import { acceptSuggestedHours, getCurrentRoadmap, markReplanSeen, setKnownSkill, updateTopic } from '../services/roadmapApi';
import useAuth from '../hooks/useAuth';
import { dismissOffer, offerDismissed } from '../lib/offers';
import { withTopicDone } from '../lib/progress';
import { createSerialQueue } from '../lib/serialQueue';

// React Flow is heavy, so the tree loads only when this page is opened.
const RoadmapTree = lazy(() => import('../components/roadmap/RoadmapTree'));

export default function RoadmapPage() {
  const { refreshUser } = useAuth();
  const [menu, setMenu] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [, setOfferVersion] = useState(0); // re-render after an offer is dismissed on this device
  const [saved, setSaved] = useState(null); // { roadmap: { id, version, plan }, progress, replan }
  const [goals, setGoals] = useState([]);
  const [problem, setProblem] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [view, setView] = useState(() => (window.matchMedia('(max-width: 639px)').matches ? 'weeks' : 'tree'));
  const confirmed = useRef(null); // last progress the server confirmed, for rolling back a failed tick
  const queue = useRef(createSerialQueue()); // ticks reach the server in click order
  const planRef = useRef(null);

  const apply = useCallback((data) => { confirmed.current = data.progress; setSaved(data); }, []);

  const load = useCallback(() => {
    setProblem(null); setSaved(null);
    Promise.all([getCurrentRoadmap(), getGoals()])
      .then(([data, catalog]) => { apply(data); setGoals(catalog.goals); })
      .catch((error) => setProblem({ code: error.code, message: error.message }));
  }, [apply]);
  useEffect(load, [load]);

  // Ticks a topic immediately, then replaces the guess with the server's numbers (or puts things back on failure).
  // Clicks are sent one after another, and only the last answer is shown, so quick tick/untick cannot show stale numbers.
  const toggleTopic = useCallback(async (topicId, done) => {
    setNotice(null);
    setSaved((current) => (current ? { ...current, progress: withTopicDone(current.progress, topicId, done, planRef.current) } : current));
    const { value, error, idle } = await queue.current.run(() => updateTopic(topicId, { done }));
    if (error) {
      if (idle) setSaved((current) => (current ? { ...current, progress: confirmed.current } : current));
      setNotice(error.message);
      return;
    }
    if (value.roadmapChanged) { // un-ticking finished work from an earlier version puts it back into the plan
      if (idle) apply(await getCurrentRoadmap());
      return;
    }
    confirmed.current = value.progress;
    if (idle) setSaved((current) => (current ? { ...current, progress: value.progress, replan: value.replan ?? current.replan } : current));
  }, [apply]);

  const logTime = useCallback(async (topicId, minutesSpent) => {
    setNotice(null);
    const { value, error, idle } = await queue.current.run(() => updateTopic(topicId, { minutesSpent }));
    if (error) { setNotice(error.message); return; }
    confirmed.current = value.progress;
    if (idle) setSaved((current) => (current ? { ...current, progress: value.progress } : current));
  }, []);

  // Marks or unmarks a skill as known; the saved roadmap regenerates (finished topics stay finished) and the open skill stays selected.
  const toggleKnown = useCallback(async (nodeId, known) => {
    setBusy(true); setNotice(null);
    try {
      await setKnownSkill(nodeId, known);
      apply(await getCurrentRoadmap());
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }, [apply]);

  // The student has read the explanation of a replan; the server remembers, then the page refreshes its replan information.
  const dismissEvent = useCallback(async (event) => {
    setBannerBusy(true); setNotice(null);
    try { await markReplanSeen(event.id); apply(await getCurrentRoadmap()); } catch (error) { setNotice(error.message); } finally { setBannerBusy(false); }
  }, [apply]);

  // Accepting the offer lowers the weekly hours (never anything else); the roadmap then regenerates keeping finished work.
  const acceptHours = useCallback(async (hoursPerWeek) => {
    setNotice(null);
    try { await acceptSuggestedHours(hoursPerWeek); await refreshUser(); apply(await getCurrentRoadmap()); } catch (error) { setNotice(error.message); }
  }, [apply, refreshUser]);

  const keepHours = useCallback(async (offer) => {
    dismissOffer(offer);
    setOfferVersion((n) => n + 1);
    const event = saved?.replan?.event;
    if (event) await dismissEvent(event);
  }, [saved, dismissEvent]);

  const plan = saved?.roadmap.plan;
  planRef.current = plan;
  const progress = saved?.progress;
  const byId = useMemo(() => new Map([...(plan?.nodes || []), ...(plan?.extras?.nodes || [])].map((node) => [node.id, node])), [plan]);
  const nameOf = useCallback((id) => byId.get(id)?.name || id, [byId]);
  const select = useCallback((id) => setSelectedId((current) => (current === id ? null : id)), []);
  const close = useCallback(() => { setSelectedId(null); setNotice(null); }, []);
  const selected = selectedId ? byId.get(selectedId) : null;

  const goal = goals.find((g) => g.id === plan?.goalId);
  const track = goal?.subTracks?.find((s) => s.id === plan?.subTrack);

  return (
    <div className="app-shell min-h-screen lg:flex">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      {menu && <button onClick={() => setMenu(false)} className="fixed inset-0 z-20 bg-ink/45 lg:hidden" aria-label="Close navigation" />}
      <div className="workspace-shell min-w-0 flex-1">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-7xl p-6 sm:p-9 lg:p-12">
          <div className="dashboard-arrival">
            {!saved && !problem && (
              <div role="status" aria-label="Building your roadmap">
                <div className="h-14 max-w-xl animate-pulse bg-warm" />
                <div className="mt-8 h-48 animate-pulse bg-warm" />
                <div className="mt-6 h-[420px] animate-pulse bg-warm" />
              </div>
            )}

            {problem && <RoadmapBlocker problem={problem} onRetry={load} />}

            {saved && (
              <>
                <RoadmapSummary roadmap={plan} progress={progress} version={saved.roadmap.version} goalLabel={goal?.label || 'Your goal'} trackLabel={track?.label} />
                <ReplanBanner
                  event={saved.replan?.event} busy={bannerBusy}
                  suggestion={saved.replan?.suggestion && !offerDismissed(saved.replan.suggestion) ? saved.replan.suggestion : null}
                  onDismiss={dismissEvent} onAcceptHours={acceptHours} onKeepHours={keepHours}
                />
                {notice && !selected && <p role="alert" className="mt-4 text-sm font-bold text-error">{notice}</p>}

                <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
                  <div role="group" aria-label="Roadmap view" className="inline-flex border border-pale bg-white">
                    {[['tree', 'Skill tree', Network], ['weeks', 'Week by week', ListChecks]].map(([key, label, Icon]) => (
                      <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key}
                        className={`control-transition inline-flex min-h-11 items-center gap-2 px-4 text-sm font-extrabold ${view === key ? 'bg-mid text-cream' : 'text-ink hover:text-mid'}`}>
                        <Icon size={16} aria-hidden="true" /> {label}
                      </button>
                    ))}
                  </div>
                  {view === 'tree' && <p className="text-xs text-muted">Select a skill to see its topics, tick them off, and open resources.</p>}
                </div>

                <div className="mt-6 lg:flex lg:items-start lg:gap-6">
                  <div className="min-w-0 flex-1">
                    {view === 'tree'
                      ? <Suspense fallback={<div className="h-[72vh] animate-pulse bg-warm" aria-label="Loading skill tree" />}><RoadmapTree roadmap={plan} progress={progress} selectedId={selectedId} onSelect={select} /></Suspense>
                      : <WeekList roadmap={plan} progress={progress} onToggleTopic={toggleTopic} onLogTime={logTime} onOpenSkill={select} />}
                  </div>
                  {selected && <NodeDetails node={selected} nameOf={nameOf} progress={progress} onClose={close} onToggleKnown={toggleKnown} onToggleTopic={toggleTopic} onLogTime={logTime} busy={busy} notice={notice} />}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
