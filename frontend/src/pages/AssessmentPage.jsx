import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Sidebar from '../components/home/Sidebar';
import Topbar from '../components/home/Topbar';
import Button from '../components/common/Button';
import AssessmentIntro from '../components/assessment/AssessmentIntro';
import AssessmentTimer from '../components/assessment/AssessmentTimer';
import DomainProgress from '../components/assessment/DomainProgress';
import SelfReportStep from '../components/assessment/SelfReportStep';
import QuizStep from '../components/assessment/QuizStep';
import AssessmentResults from '../components/assessment/AssessmentResults';
import useAuth from '../hooks/useAuth';
import { getDomains, sampleQuestions, submitAssessment } from '../services/assessmentApi';

// Flow: intro → (self-report → quiz) per domain → server-side scoring → results.
const fresh = { stage: 'intro', index: 0, skippedDomains: [], shownQuestions: {}, answers: {}, questions: [], attempt: null, startedAt: null, deadline: null, timedOut: false };
// The next step renders where the last button was, so the second click of a double-click
// would otherwise answer the next domain too (e.g. silently skipping it).
const STEP_LOCK_MS = 400;
// 25 minutes; VITE_ASSESSMENT_MINUTES can shorten it, e.g. to demonstrate the auto-submit.
const TIME_LIMIT_SECONDS = Math.round((Number(import.meta.env.VITE_ASSESSMENT_MINUTES) || 25) * 60);

export default function AssessmentPage() {
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [domains, setDomains] = useState([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [run, setRun] = useState(fresh);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(null);
  const [now, setNow] = useState(Date.now());
  const lockedUntil = useRef(0);
  const draft = useRef({}); // selections on the quiz currently on screen
  const closed = useRef(false); // true once this attempt is being submitted
  const submitting = useRef(false);

  // Wraps step-changing actions so only the first of several rapid clicks counts.
  const once = (action) => (...args) => {
    if (Date.now() < lockedUntil.current) return;
    lockedUntil.current = Date.now() + STEP_LOCK_MS;
    action(...args);
  };

  const loadDomains = useCallback(() => {
    setLoadingDomains(true); setError(null);
    getDomains().then(setDomains).catch((e) => { setError(e.message); setRetry(() => loadDomains); }).finally(() => setLoadingDomains(false));
  }, []);
  useEffect(loadDomains, [loadDomains]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [run.stage, run.index]);

  const answering = ['report', 'quiz'].includes(run.stage);
  // Remaining time is measured against a fixed deadline, so it stays correct even if the tab is throttled.
  useEffect(() => {
    if (!answering) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [answering]);
  const remaining = run.deadline ? Math.max(0, Math.ceil((run.deadline - now) / 1000)) : TIME_LIMIT_SECONDS;

  const fail = (e, again) => { setError(e.message); setRetry(() => again); setBusy(false); };

  const submit = async (next) => {
    if (submitting.current) return;
    submitting.current = true; closed.current = true;
    setRun({ ...next, stage: 'submitting' }); setBusy(true); setError(null);
    try {
      const attempt = await submitAssessment({
        skippedDomains: next.skippedDomains, shownQuestions: next.shownQuestions, answers: next.answers,
        timing: { limitSeconds: TIME_LIMIT_SECONDS, durationSeconds: Math.min(TIME_LIMIT_SECONDS, Math.round((Date.now() - next.startedAt) / 1000)), timedOut: next.timedOut }
      });
      setRun({ ...next, stage: 'results', attempt });
      setBusy(false);
    } catch (e) { fail(e, () => submit(next)); }
    finally { submitting.current = false; }
  };

  // Time is up: keep what was answered on the current quiz (the rest count as incorrect);
  // domains never reached are left out of the profile and shown as "Not reached".
  useEffect(() => {
    if (!answering || !run.deadline || now < run.deadline || closed.current) return;
    let next = { ...run, timedOut: true, questions: [] };
    if (run.stage === 'quiz') {
      const key = domains[run.index].key;
      next = { ...next, answers: { ...run.answers, [key]: Object.fromEntries(run.questions.map((q) => [q.id, draft.current[q.id] ?? -1])) } };
    }
    submit(next);
  });

  const start = () => {
    closed.current = false; draft.current = {};
    const startedAt = Date.now();
    setNow(startedAt);
    setRun({ ...fresh, stage: 'report', startedAt, deadline: startedAt + TIME_LIMIT_SECONDS * 1000 });
  };

  // Moves to the next domain, or submits once every domain has been handled.
  const advance = (next) => {
    if (closed.current) return;
    const moved = { ...next, index: next.index + 1, questions: [] };
    if (moved.index >= domains.length) submit(moved);
    else setRun({ ...moved, stage: 'report' });
  };

  const choose = async (choice) => {
    if (closed.current) return;
    const domain = domains[run.index];
    if (choice === 'no') return advance({ ...run, skippedDomains: [...run.skippedDomains, domain.key] });
    setBusy(true); setError(null);
    try {
      const questions = await sampleQuestions(domain.key);
      if (closed.current) return; // time ran out while the questions were loading
      draft.current = {};
      setRun({ ...run, stage: 'quiz', questions, shownQuestions: { ...run.shownQuestions, [domain.key]: questions.map((q) => q.id) } });
      setBusy(false);
    } catch (e) { if (!closed.current) fail(e, () => choose(choice)); }
  };

  const recordAnswers = (domainAnswers) => {
    const domain = domains[run.index];
    advance({ ...run, answers: { ...run.answers, [domain.key]: domainAnswers } });
  };
  const trackDraft = useCallback((selected) => { draft.current = selected; }, []);

  const domain = domains[run.index];

  return (
    <div className="app-shell min-h-screen lg:flex">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      {menu && <button onClick={() => setMenu(false)} className="fixed inset-0 z-20 bg-ink/45 lg:hidden" aria-label="Close navigation" />}
      <div className="workspace-shell min-w-0 flex-1">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-6xl p-6 sm:p-9 lg:p-12">
          {error && (
            <div role="alert" className="surface-card mb-8 flex flex-wrap items-center gap-4 border-l-[5px] border-l-error px-6 py-5">
              <AlertTriangle size={20} className="text-error" aria-hidden="true" />
              <p className="flex-1 text-sm font-bold text-ink">{error}</p>
              {retry && <Button onClick={() => retry()} className="min-h-10">Try again</Button>}
            </div>
          )}

          {run.stage === 'intro' && <AssessmentIntro firstName={user?.name?.split(' ')[0]} domains={domains} loading={loadingDomains} minutes={TIME_LIMIT_SECONDS / 60} onStart={once(start)} />}

          {answering && domain && (
            <>
              {/* Sticky so the timer stays visible while scrolling a long quiz. */}
              <div className="sticky top-0 z-10 -mx-6 border-b border-[var(--rule)] bg-cream px-6 py-4 sm:-mx-9 sm:px-9 lg:-mx-12 lg:px-12">
                <DomainProgress domains={domains} index={run.index}><AssessmentTimer remaining={remaining} limit={TIME_LIMIT_SECONDS} /></DomainProgress>
              </div>
              <div className="dashboard-arrival" key={`${run.stage}-${run.index}`}>
                {run.stage === 'report' && <SelfReportStep domain={domain} position={run.index + 1} total={domains.length} busy={busy} onChoose={once(choose)} />}
                {run.stage === 'quiz' && <QuizStep domain={domain} questions={run.questions} isLast={run.index === domains.length - 1} onNext={once(recordAnswers)} onChange={trackDraft} />}
              </div>
            </>
          )}

          {run.stage === 'submitting' && (
            <div className="dashboard-arrival">
              <DomainProgress domains={domains} index={run.timedOut ? run.index : domains.length} />
              <section className="surface-card mt-8 flex items-center gap-4 px-6 py-8 sm:px-10">
                {busy && <span className="h-5 w-5 animate-spin rounded-full border-2 border-mid border-r-transparent" />}
                <p className="text-lg font-bold tracking-[-.03em] text-ink">{run.timedOut ? 'Time is up — submitting your answers…' : busy ? 'Scoring your assessment…' : 'Your answers are ready to submit.'}</p>
              </section>
            </div>
          )}

          {run.stage === 'results' && run.attempt && <AssessmentResults attempt={run.attempt} domains={domains} onRetake={once(() => setRun(fresh))} />}
        </main>
      </div>
    </div>
  );
}
