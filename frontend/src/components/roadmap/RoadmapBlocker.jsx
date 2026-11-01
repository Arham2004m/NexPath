import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Button from '../common/Button';

// What to tell the student, and where to send them, for each reason a roadmap cannot be shown yet.
const blockers = {
  GOAL_REQUIRED: { title: 'Choose a goal first', text: 'Your roadmap is built around a goal.', to: '/goal', cta: 'Choose your goal' },
  ASSESSMENT_REQUIRED: { title: 'Take the assessment first', text: 'It tells us where your roadmap should start.', to: '/assessment', cta: 'Begin assessment' },
  GOAL_NOT_READY: { title: 'This roadmap is coming soon', text: 'We are still building the path for this goal. Choose another goal for now, or check back soon.', to: '/goal', cta: 'Change goal' }
};

export default function RoadmapBlocker({ problem, label = 'Your roadmap', onRetry }) {
  const blocker = blockers[problem.code];
  return (
    <section role="alert" className="surface-card feature-card px-6 py-8 sm:px-10">
      {blocker ? (
        <>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">{label}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-.055em] text-ink sm:text-4xl">{blocker.title}.</h1>
          <p className="mt-3 max-w-xl text-[16px] leading-7 text-muted">{blocker.text}</p>
          <Link to={blocker.to} className="control-transition mt-6 inline-flex min-h-12 items-center bg-mid px-5 text-sm font-extrabold text-cream hover:bg-deep">{blocker.cta}</Link>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <AlertTriangle size={20} className="text-error" aria-hidden="true" />
          <p className="flex-1 text-sm font-bold text-ink">{problem.message}</p>
          <Button onClick={onRetry} className="min-h-10">Try again</Button>
        </div>
      )}
    </section>
  );
}
