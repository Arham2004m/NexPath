import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ListChecks, Network } from 'lucide-react';
import Sidebar from '../components/home/Sidebar';
import Topbar from '../components/home/Topbar';
import Button from '../components/common/Button';
import RoadmapSummary from '../components/roadmap/RoadmapSummary';
import NodeDetails from '../components/roadmap/NodeDetails';
import WeekList from '../components/roadmap/WeekList';
import { getGoals } from '../services/goalApi';
import { previewRoadmap } from '../services/roadmapApi';

// React Flow is heavy, so the tree loads only when this page is opened.
const RoadmapTree = lazy(() => import('../components/roadmap/RoadmapTree'));

// What to tell the student, and where to send them, for each reason a roadmap cannot be shown yet.
const blockers = {
  GOAL_REQUIRED: { title: 'Choose a goal first', text: 'Your roadmap is built around a goal.', to: '/goal', cta: 'Choose your goal' },
  ASSESSMENT_REQUIRED: { title: 'Take the assessment first', text: 'It tells us where your roadmap should start.', to: '/assessment', cta: 'Begin assessment' },
  GOAL_NOT_READY: { title: 'This roadmap is coming soon', text: 'We are still building the path for this goal. Choose another goal for now, or check back soon.', to: '/goal', cta: 'Change goal' }
};

export default function RoadmapPage() {
  const [menu, setMenu] = useState(false);
  const [roadmap, setRoadmap] = useState(null);
  const [goals, setGoals] = useState([]);
  const [problem, setProblem] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState(() => (window.matchMedia('(max-width: 639px)').matches ? 'weeks' : 'tree'));

  const load = useCallback(() => {
    setProblem(null); setRoadmap(null);
    Promise.all([previewRoadmap(), getGoals()])
      .then(([data, catalog]) => { setRoadmap(data); setGoals(catalog.goals); })
      .catch((error) => setProblem({ code: error.code, message: error.message }));
  }, []);
  useEffect(load, [load]);

  const byId = useMemo(() => new Map((roadmap?.nodes || []).map((node) => [node.id, node])), [roadmap]);
  const nameOf = useCallback((id) => byId.get(id)?.name || id, [byId]);
  const select = useCallback((id) => setSelectedId((current) => (current === id ? null : id)), []);
  const close = useCallback(() => setSelectedId(null), []);
  const selected = selectedId ? byId.get(selectedId) : null;

  const goal = goals.find((g) => g.id === roadmap?.goalId);
  const track = goal?.subTracks?.find((s) => s.id === roadmap?.subTrack);
  const blocker = problem && blockers[problem.code];

  return (
    <div className="app-shell min-h-screen lg:flex">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      {menu && <button onClick={() => setMenu(false)} className="fixed inset-0 z-20 bg-ink/45 lg:hidden" aria-label="Close navigation" />}
      <div className="workspace-shell min-w-0 flex-1">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-7xl p-6 sm:p-9 lg:p-12">
          <div className="dashboard-arrival">
            {!roadmap && !problem && (
              <div role="status" aria-label="Building your roadmap">
                <div className="h-14 max-w-xl animate-pulse bg-warm" />
                <div className="mt-8 h-48 animate-pulse bg-warm" />
                <div className="mt-6 h-[420px] animate-pulse bg-warm" />
              </div>
            )}

            {problem && (
              <section role="alert" className="surface-card feature-card px-6 py-8 sm:px-10">
                {blocker ? (
                  <>
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">Your roadmap</p>
                    <h1 className="mt-3 text-3xl font-extrabold tracking-[-.055em] text-ink sm:text-4xl">{blocker.title}.</h1>
                    <p className="mt-3 max-w-xl text-[16px] leading-7 text-muted">{blocker.text}</p>
                    <Link to={blocker.to} className="control-transition mt-6 inline-flex min-h-12 items-center bg-mid px-5 text-sm font-extrabold text-cream hover:bg-deep">{blocker.cta}</Link>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-4">
                    <AlertTriangle size={20} className="text-error" aria-hidden="true" />
                    <p className="flex-1 text-sm font-bold text-ink">{problem.message}</p>
                    <Button onClick={load} className="min-h-10">Try again</Button>
                  </div>
                )}
              </section>
            )}

            {roadmap && (
              <>
                <RoadmapSummary roadmap={roadmap} goalLabel={goal?.label || 'Your goal'} trackLabel={track?.label} />

                <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
                  <div role="group" aria-label="Roadmap view" className="inline-flex border border-pale bg-white">
                    {[['tree', 'Skill tree', Network], ['weeks', 'Week by week', ListChecks]].map(([key, label, Icon]) => (
                      <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key}
                        className={`control-transition inline-flex min-h-11 items-center gap-2 px-4 text-sm font-extrabold ${view === key ? 'bg-mid text-cream' : 'text-ink hover:text-mid'}`}>
                        <Icon size={16} aria-hidden="true" /> {label}
                      </button>
                    ))}
                  </div>
                  {view === 'tree' && <p className="text-xs text-muted">Select a skill to see its topics, mini tasks and resources.</p>}
                </div>

                <div className="mt-6 lg:flex lg:items-start lg:gap-6">
                  <div className="min-w-0 flex-1">
                    {view === 'tree'
                      ? <Suspense fallback={<div className="h-[72vh] animate-pulse bg-warm" aria-label="Loading skill tree" />}><RoadmapTree roadmap={roadmap} selectedId={selectedId} onSelect={select} /></Suspense>
                      : <WeekList roadmap={roadmap} />}
                  </div>
                  {view === 'tree' && selected && <NodeDetails node={selected} nameOf={nameOf} onClose={close} />}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
