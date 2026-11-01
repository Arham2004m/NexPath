import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/home/Sidebar';
import Topbar from '../components/home/Topbar';
import SummaryCard from '../components/home/SummaryCard';
import RoadmapBlocker from '../components/roadmap/RoadmapBlocker';
import ReplanBanner from '../components/replan/ReplanBanner';
import ReplanHistory from '../components/replan/ReplanHistory';
import TopicCheck from '../components/roadmap/TopicCheck';
import { getGoals } from '../services/goalApi';
import { acceptSuggestedHours, getDashboard, markReplanSeen, replanNow, updateTopic } from '../services/roadmapApi';
import useAuth from '../hooks/useAuth';
import { dismissOffer, offerDismissed } from '../lib/offers';
import { hoursLabel, paceSummary } from '../lib/progress';
import { longDate, shortDate } from '../lib/format';
import { createSerialQueue } from '../lib/serialQueue';

const WeeklyChart = lazy(() => import('../components/progress/WeeklyChart'));

export default function ProgressPage() {
  const { refreshUser } = useAuth();
  const [menu, setMenu] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState(null);
  const [, setOfferVersion] = useState(0); // re-render after an offer is dismissed on this device
  const [data, setData] = useState(null); // { roadmap, progress, replan }
  const [goals, setGoals] = useState([]);
  const [problem, setProblem] = useState(null);
  const [notice, setNotice] = useState(null);
  const confirmed = useRef(null);
  const queue = useRef(createSerialQueue());

  const load = useCallback(() => {
    setProblem(null); setData(null);
    Promise.all([getDashboard(), getGoals()])
      .then(([dashboard, catalog]) => { confirmed.current = dashboard.progress; setData(dashboard); setGoals(catalog.goals); })
      .catch((error) => setProblem({ code: error.code, message: error.message }));
  }, []);
  useEffect(load, [load]);

  // Fetches fresh numbers without blanking the page.
  const refresh = useCallback(async () => {
    const dashboard = await getDashboard();
    confirmed.current = dashboard.progress;
    setData(dashboard);
  }, []);

  const dismissEvent = useCallback(async (event) => {
    setBannerBusy(true); setNotice(null);
    try { await markReplanSeen(event.id); await refresh(); } catch (error) { setNotice(error.message); } finally { setBannerBusy(false); }
  }, [refresh]);

  const acceptHours = useCallback(async (hoursPerWeek) => {
    setNotice(null);
    try { await acceptSuggestedHours(hoursPerWeek); await refreshUser(); await refresh(); } catch (error) { setNotice(error.message); }
  }, [refresh, refreshUser]);

  const keepHours = useCallback(async (offer) => {
    dismissOffer(offer);
    setOfferVersion((n) => n + 1);
    const event = data?.replan?.event;
    if (event) await dismissEvent(event);
  }, [data, dismissEvent]);

  // "Check my plan now": same rules as the automatic check, minus the 7 day wait; always says what happened and why.
  const reviewNow = useCallback(async () => {
    setReviewing(true); setNotice(null); setReviewMessage(null);
    try {
      const result = await replanNow();
      setReviewMessage(result.message);
      await refresh();
    } catch (error) { setNotice(error.message); } finally { setReviewing(false); }
  }, [refresh]);

  // Tick a topic from the "up next" list; clicks are sent in order and the server's numbers replace the whole page's progress.
  const tick = useCallback(async (topicId, done) => {
    setNotice(null);
    const { value, error, idle } = await queue.current.run(() => updateTopic(topicId, { done }));
    if (error) { setNotice(error.message); return; }
    confirmed.current = value.progress;
    if (value.roadmapChanged) { load(); return; } // finished work from an earlier version was put back into the plan
    if (idle) setData((current) => (current ? { ...current, progress: value.progress, replan: value.replan ? { ...current.replan, ...value.replan } : current.replan } : current));
  }, [load]);

  const progress = data?.progress;
  const plan = data?.roadmap;
  const goal = goals.find((g) => g.id === plan?.goalId);
  const track = goal?.subTracks?.find((s) => s.id === plan?.subTrack);
  const pace = progress ? paceSummary(progress) : null;
  const thisWeek = progress?.weekly.find((week) => week.state === 'current');

  return (
    <div className="app-shell min-h-screen lg:flex">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      {menu && <button onClick={() => setMenu(false)} className="fixed inset-0 z-20 bg-ink/45 lg:hidden" aria-label="Close navigation" />}
      <div className="workspace-shell min-w-0 flex-1">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-6xl p-6 sm:p-9 lg:p-12">
          <div className="dashboard-arrival">
            {!data && !problem && (
              <div role="status" aria-label="Loading your progress">
                <div className="h-14 max-w-xl animate-pulse bg-warm" />
                <div className="mt-8 h-44 animate-pulse bg-warm" />
                <div className="mt-6 h-72 animate-pulse bg-warm" />
              </div>
            )}

            {problem && <RoadmapBlocker problem={problem} label="Your progress" onRetry={load} />}

            {data && (
              <>
                <header className="max-w-3xl">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">Progress · {goal?.label || 'Your goal'}{track ? `, ${track.label}` : ''}</p>
                  <h1 className="mt-4 text-4xl font-extrabold leading-[.94] tracking-[-.065em] text-ink sm:text-6xl">{progress.percentComplete}% of your roadmap is done.</h1>
                  <p className="mt-6 max-w-2xl text-[17px] leading-8 text-muted">{progress.topicsDone} of {progress.topicsTotal} topics in the current plan, {hoursLabel(progress.doneHours)} of {hoursLabel(progress.totalHours)}.{' '}
                    <Link to="/roadmap" className="font-bold text-mid underline-offset-4 hover:underline">Open the roadmap</Link></p>
                </header>

                <ReplanBanner
                  event={data.replan?.event} busy={bannerBusy}
                  suggestion={data.replan?.suggestion && !offerDismissed(data.replan.suggestion) ? data.replan.suggestion : null}
                  onDismiss={dismissEvent} onAcceptHours={acceptHours} onKeepHours={keepHours}
                />

                <div className="surface-card feature-card mt-9 px-6 py-6 sm:px-8">
                  <div className="h-3 bg-pale/60" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentComplete} aria-label="Overall roadmap progress"><div className="h-full bg-mid" style={{ width: `${progress.percentComplete}%` }} /></div>
                  <p className="mt-4 text-sm leading-6 text-muted"><span className="font-bold text-ink">{pace.label}.</span> {pace.detail}</p>
                  {progress.pace !== 'complete' && (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button type="button" onClick={reviewNow} disabled={reviewing} className="control-transition inline-flex min-h-10 items-center border border-pale bg-white px-4 text-sm font-extrabold text-ink hover:border-mid disabled:opacity-60">{reviewing ? 'Checking…' : 'Check my plan now'}</button>
                      <p className="text-xs text-muted">Your plan adapts by itself when you fall two weeks behind or get a week ahead; this checks right away.</p>
                    </div>
                  )}
                  {reviewMessage && <p role="status" className="mt-3 text-sm font-bold leading-6 text-ink">{reviewMessage}</p>}
                </div>

                <section className="summary-grid mt-6 grid md:grid-cols-3">
                  <SummaryCard index={0} label="This week" value={thisWeek ? `Week ${thisWeek.index} of ${progress.totalWeeks}` : progress.totalWeeks ? 'Plan finished' : 'Complete'} detail={thisWeek ? `${shortDate(thisWeek.startDate)} – ${shortDate(thisWeek.endDate)}: ${thisWeek.completedHours} of ${thisWeek.plannedHours} planned hours done.` : `Plan runs ${shortDate(plan.startDate)} – ${longDate(plan.endDate)}.`} />
                  <SummaryCard index={1} label="Time spent" value={hoursLabel(progress.loggedHours)} detail={`Logged by you, against ${hoursLabel(progress.plannedHoursToDate)} planned so far. Log time on a topic in the roadmap.`} />
                  <SummaryCard index={2} label="Weekly completion" value={progress.weeksEnded ? `${Math.round((progress.velocity ?? 0) * 100)}%` : 'Not yet'} detail={progress.weeksEnded ? `Of the work planned in ${progress.weeksEnded} finished week${progress.weeksEnded === 1 ? '' : 's'}, this much is done.` : 'Measured once your first week has ended.'} />
                </section>

                {progress.extras?.total > 0 && (
                  <section className="surface-card mt-6 border-dashed px-6 py-5 sm:px-8" aria-labelledby="extras-heading">
                    <h2 id="extras-heading" className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Optional extras</h2>
                    <p className="mt-2 text-sm leading-6 text-muted"><span className="font-bold text-ink">{progress.extras.done} of {progress.extras.total} done</span> ({hoursLabel(progress.extras.doneHours)} of {hoursLabel(progress.extras.hours)}). Extra material for when you are ahead; it never changes your percentage or finish date. <Link to="/roadmap" className="font-bold text-mid underline-offset-4 hover:underline">Open it in the roadmap</Link></p>
                  </section>
                )}

                <section className="surface-card mt-6 px-6 py-6 sm:px-8" aria-labelledby="weekly-heading">
                  <h2 id="weekly-heading" className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Week by week</h2>
                  <div className="mt-3">
                    <Suspense fallback={<div className="h-64 animate-pulse bg-warm" />}><WeeklyChart weekly={progress.weekly} /></Suspense>
                  </div>
                </section>

                <section className="surface-card mt-6 px-6 py-6 sm:px-8" aria-labelledby="next-heading">
                  <h2 id="next-heading" className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Up next</h2>
                  {notice && <p role="alert" className="mt-2 text-sm font-bold text-error">{notice}</p>}
                  {progress.nextUp.length === 0 ? (
                    <p className="mt-3 text-sm leading-6 text-muted">{progress.topicsTotal ? 'Nothing left: every topic is done.' : 'No topics are scheduled.'}</p>
                  ) : (
                    <ul className="mt-4 space-y-2">
                      {progress.nextUp.map((topic) => (
                        <li key={topic.topicId} className="flex items-start gap-3 border-b border-[var(--rule)] pb-2">
                          <TopicCheck done={progress.topicStatus[topic.topicId] === 'done'} overdue={topic.overdue} title={topic.title} onToggle={(done) => tick(topic.topicId, done)} />
                          <span className="min-w-0 flex-1">
                            <span className="font-bold text-ink">{topic.title}</span>
                            {topic.overdue && <span className="ml-2 font-mono text-[10px] uppercase tracking-[.1em] text-error">Overdue</span>}
                            <span className="block text-xs text-muted">{topic.nodeName} · week {topic.week}</span>
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-muted">{topic.hours} h</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="surface-card mt-6 px-6 py-6 sm:px-8" aria-labelledby="changes-heading">
                  <h2 id="changes-heading" className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Plan changes</h2>
                  <ReplanHistory events={data.replan?.history} />
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
