import { CircleDot, X } from 'lucide-react';
import { Link } from 'react-router-dom';

// The next onboarding step depends on how far the student has got.
const steps = {
  assessment: { eyebrow: 'Your first move', title: 'Start with the assessment.', text: 'It turns the vague question of where you stand into a useful baseline for choosing placements, projects, and skills.', to: '/assessment', cta: 'Begin assessment' },
  goal: { eyebrow: 'Next step', title: 'Choose where you are headed.', text: 'Pick a goal, a sub-track if it has one, and the hours you can give each week. Your roadmap is shaped around all three.', to: '/goal', cta: 'Choose your goal' }
};

export default function OnboardingCard({ step = 'assessment', onDismiss }) {
  const { eyebrow, title, text, to, cta } = steps[step];
  return <section className="feature-card surface-card relative px-6 py-8 sm:px-8 sm:py-10"><button onClick={onDismiss} className="control-transition absolute right-4 top-4 p-1 text-muted hover:text-ink" aria-label="Dismiss next step"><X size={18}/></button><div className="grid gap-6 pr-6 md:grid-cols-[auto_1fr_auto] md:items-center"><div className="grid h-12 w-12 place-items-center bg-mid text-cream shadow-[0_8px_18px_rgba(15,76,117,.22)]"><CircleDot size={22}/></div><div><p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">{eyebrow}</p><h2 className="mt-3 text-3xl font-extrabold leading-none tracking-[-.055em] text-ink">{title}</h2><p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">{text}</p></div><Link to={to} className="control-transition inline-flex w-fit bg-mid px-5 py-3 text-sm font-extrabold tracking-[.01em] text-cream shadow-[0_8px_18px_rgba(15,76,117,.2)] hover:-translate-y-px hover:bg-deep">{cta}</Link></div></section>;
}
