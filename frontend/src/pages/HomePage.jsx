import { useEffect, useState } from 'react';
import Sidebar from '../components/home/Sidebar';
import Topbar from '../components/home/Topbar';
import OnboardingCard from '../components/home/OnboardingCard';
import SummaryCard from '../components/home/SummaryCard';
import useAuth from '../hooks/useAuth';
import { getGoals } from '../services/goalApi';
import { getLatestAttempt } from '../services/assessmentApi';
import { summarizeAttempt } from '../lib/assessmentSummary';

export default function HomePage() {
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [goals, setGoals] = useState([]);
  const [attempt, setAttempt] = useState(undefined); // undefined = still loading

  useEffect(() => {
    getGoals().then((data) => setGoals(data.goals)).catch(() => {});
    getLatestAttempt().then(setAttempt).catch(() => setAttempt(null));
  }, []);

  const goal = goals.find((g) => g.id === user?.goalId);
  const track = goal?.subTracks?.find((s) => s.id === user?.subTrack);
  const summary = summarizeAttempt(attempt);
  const step = attempt === null ? 'assessment' : attempt && !user?.goalId ? 'goal' : null;

  return (
    <div className="app-shell min-h-screen lg:flex">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      {menu && <button onClick={() => setMenu(false)} className="fixed inset-0 z-20 bg-ink/45 lg:hidden" aria-label="Close navigation" />}
      <div className="workspace-shell min-w-0 flex-1">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-6xl p-6 sm:p-9 lg:p-12">
          <div className="dashboard-arrival">
            <header className="max-w-3xl">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">Your career workspace</p>
              <h1 className="mt-4 text-4xl font-extrabold leading-[.94] tracking-[-.065em] text-ink sm:text-6xl">Good to see you, {user?.name?.split(' ')[0]}.</h1>
              <p className="mt-6 max-w-2xl text-[17px] leading-8 text-muted">You do not need every answer today. You only need a useful next step.</p>
            </header>
            {step && !dismissed && <div className="mt-11"><OnboardingCard step={step} onDismiss={() => setDismissed(true)} /></div>}
          </div>
          <section className="mt-11">
            <div className="summary-grid grid md:grid-cols-[1.2fr_.9fr_.9fr]">
              <SummaryCard index={0} label="Direction" value={goal ? (track ? `${goal.label} · ${track.label}` : goal.label) : 'Still open'} detail={goal ? `${user.hoursPerWeek} hours a week${user.targetWeeks ? `, aiming for ${user.targetWeeks} weeks` : ''}. Change it any time from Goal.` : 'Name a destination when you are ready; we will shape the work around it.'} />
              <SummaryCard index={1} label="Starting point" value={summary?.level || 'Not assessed'} detail={summary ? (summary.strongest ? `Strongest in ${summary.strongest}.` : 'Based on your latest assessment.') : 'A baseline makes your effort more intentional.'} />
              <SummaryCard index={2} label="Path completed" value="0%" detail="Your first milestone is waiting." />
            </div>
          </section>
          <section className="mt-14 grid gap-5 border-t-2 section-rule pt-8 sm:grid-cols-[minmax(13rem,.55fr)_1fr]">
            <p className="text-2xl font-extrabold leading-tight tracking-[-.05em] text-ink">A path takes shape through small choices.</p>
            <p className="max-w-2xl text-sm leading-7 text-muted">Complete your assessment and choose a goal to unlock a weekly roadmap built for the direction you choose.</p>
          </section>
        </main>
      </div>
    </div>
  );
}
