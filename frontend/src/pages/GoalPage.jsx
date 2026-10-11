import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Sidebar from '../components/home/Sidebar';
import Topbar from '../components/home/Topbar';
import Button from '../components/common/Button';
import GoalCard from '../components/goal/GoalCard';
import SubTrackPicker from '../components/goal/SubTrackPicker';
import RecommendedGoals from '../components/goal/RecommendedGoals';
import TimeCommitment from '../components/goal/TimeCommitment';
import useAuth from '../hooks/useAuth';
import { getGoals, getRecommendations, saveGoal } from '../services/goalApi';
import { getLatestAttempt } from '../services/assessmentApi';
import { summarizeAttempt } from '../lib/assessmentSummary';

export default function GoalPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [attempt, setAttempt] = useState(undefined); // undefined = loading, null = never assessed
  const [recommendations, setRecommendations] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [goalId, setGoalId] = useState(user?.goalId || null);
  const [subTrack, setSubTrack] = useState(user?.subTrack || null);
  const [hours, setHours] = useState(user?.hoursPerWeek || 10);
  const [targetWeeks, setTargetWeeks] = useState(user?.targetWeeks ? String(user.targetWeeks) : '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null); // { warning }

  const load = () => {
    setLoadError(null);
    Promise.all([getGoals(), getLatestAttempt(), getRecommendations()]).then(([goals, latest, recs]) => { setCatalog(goals); setAttempt(latest); setRecommendations(recs); }).catch((e) => setLoadError(e.message));
  };
  useEffect(load, []);

  if (attempt === null) return <Navigate to="/assessment" replace state={{ notice: 'Take the assessment first so your goal can be matched to your starting point.' }} />;

  const goal = catalog?.goals.find((g) => g.id === goalId);
  const summary = summarizeAttempt(attempt);

  const pickGoal = (id, suggestedSubTrack = null) => { setGoalId(id); setSubTrack(suggestedSubTrack); setErrors({}); setSaved(null); };
  const matchOf = (id) => recommendations.find((r) => r.goalId === id)?.match;
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setErrors({});
    try {
      const result = await saveGoal({ goalId, subTrack: subTrack || undefined, hoursPerWeek: hours, targetWeeks: targetWeeks === '' ? undefined : Number(targetWeeks) });
      await refreshUser();
      // The roadmap is the point of choosing a goal, so go straight to it; its summary explains a tight deadline.
      if (goal.roadmapReady === false || (goal.subTracks && goal.subTracks.find((s) => s.id === subTrack)?.roadmapReady === false)) setSaved({ warning: result.warning });
      else navigate('/roadmap');
    } catch (e) {
      setErrors(e.errors || { form: e.message });
    } finally { setSaving(false); }
  };

  return (
    <div className="app-shell min-h-screen lg:flex">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      {menu && <button onClick={() => setMenu(false)} className="fixed inset-0 z-20 bg-ink/45 lg:hidden" aria-label="Close navigation" />}
      <div className="workspace-shell min-w-0 flex-1">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-6xl p-6 sm:p-9 lg:p-12">
          <div className="dashboard-arrival">
            <header className="max-w-3xl">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">Goal selection</p>
              <h1 className="mt-4 text-4xl font-extrabold leading-[.94] tracking-[-.065em] text-ink sm:text-6xl">Where do you want to go?</h1>
              <p className="mt-6 max-w-2xl text-[17px] leading-8 text-muted">Pick one direction. Your roadmap is built from your assessed starting point{summary ? ` (${summary.level} overall${summary.strongest ? `, strongest in ${summary.strongest}` : ''})` : ''}, this goal and the time you can give.</p>
            </header>

            {loadError && (
              <div role="alert" className="surface-card mt-8 flex flex-wrap items-center gap-4 border-l-[5px] border-l-error px-6 py-5">
                <AlertTriangle size={20} className="text-error" aria-hidden="true" />
                <p className="flex-1 text-sm font-bold text-ink">{loadError}</p>
                <Button onClick={load} className="min-h-10">Try again</Button>
              </div>
            )}

            {!catalog && !loadError && <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-44 animate-pulse bg-warm" />)}</div>}

            {catalog && attempt && (
              <form onSubmit={submit} className="mt-11 space-y-10" noValidate>
                <RecommendedGoals recommendations={recommendations} goals={catalog.goals} selectedId={goalId} onPick={pickGoal} />

                <div>
                  <h2 className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">All goals</h2>
                  <p className="mt-2 text-sm text-muted">Prefer something else? Choose any goal; you can change it again later.</p>
                </div>
                <div role="radiogroup" aria-label="Career goal" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {catalog.goals.map((g) => <GoalCard key={g.id} goal={g} selected={g.id === goalId} match={matchOf(g.id)} onSelect={(id) => pickGoal(id)} />)}
                </div>
                {errors.goalId && <p role="alert" className="text-xs font-medium text-error">{errors.goalId}</p>}

                {goal?.subTracks && <SubTrackPicker goal={goal} value={subTrack} error={errors.subTrack} onChange={(id) => { setSubTrack(id); setSaved(null); }} />}

                {goal && <TimeCommitment estimatedHours={(goal.subTracks ? goal.subTracks.find((s) => s.id === subTrack)?.estimatedHours : goal.estimatedHours) || null} hours={hours} targetWeeks={targetWeeks} limits={catalog.limits.hoursPerWeek} errors={errors} onHours={(v) => { setHours(v); setSaved(null); }} onTargetWeeks={(v) => { setTargetWeeks(v); setSaved(null); }} />}

                {errors.form && <p role="alert" className="text-sm font-bold text-error">{errors.form}</p>}

                <div className="flex flex-wrap items-center gap-5 border-t-2 section-rule pt-7">
                  <Button type="submit" loading={saving} disabled={!goal}>{user?.goalId ? 'Update goal and view roadmap' : 'Save goal and view roadmap'}</Button>
                  {user?.goalId && <Link to="/roadmap" className="control-transition inline-flex min-h-12 items-center border border-pale bg-white px-5 text-sm font-extrabold text-ink hover:border-mid hover:text-mid">View current roadmap</Link>}
                  {!goal && <p className="text-sm text-muted">Choose a goal to continue.</p>}
                  <Link to="/home" className="control-transition inline-flex min-h-12 items-center border border-pale bg-white px-5 text-sm font-extrabold text-ink hover:border-mid hover:text-mid">Back to dashboard</Link>
                </div>

                {saved && (
                  <div role="status" className="surface-card feature-card flex items-start gap-4 px-6 py-6">
                    <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-mid" aria-hidden="true" />
                    <div>
                      <p className="text-lg font-extrabold tracking-[-.04em] text-ink">Goal saved: {goal.label}{subTrack ? ` · ${goal.subTracks.find((s) => s.id === subTrack)?.label}` : ''}</p>
                      <p className="mt-1 text-sm leading-6 text-muted">{hours} hours a week{targetWeeks ? `, aiming for ${targetWeeks} weeks` : ''}. </p>
                      {goal.roadmapReady !== false && <Link to="/roadmap" className="control-transition mt-4 inline-flex min-h-11 items-center bg-mid px-5 text-sm font-extrabold text-cream hover:bg-deep">View your roadmap</Link>}
                      {saved.warning && <p className="mt-3 text-sm font-bold leading-6 text-ink">{saved.warning}</p>}
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
