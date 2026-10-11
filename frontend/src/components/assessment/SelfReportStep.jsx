import { BookOpenCheck, BookOpen, CircleSlash } from 'lucide-react';

// "Yes" and "A little" both lead to the quiz; "No" records the domain as a self-reported Beginner.
const choices = [
  ['yes', BookOpenCheck, 'Yes', 'I have studied it properly.'],
  ['little', BookOpen, 'A little', 'I have some exposure to it.'],
  ['no', CircleSlash, 'No, total beginner', 'Skip the questions and mark me Beginner.']
];

export default function SelfReportStep({ domain, position, total, busy, onChoose }) {
  return (
    <section className="surface-card feature-card mt-8 px-6 py-8 sm:px-10 sm:py-10">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">Domain {position} of {total}</p>
      <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-[-.055em] text-ink sm:text-4xl">{domain.label}</h2>
      <p className="mt-4 text-[17px] leading-8 text-muted">Have you studied <strong className="font-bold text-ink">{domain.label}</strong> before?</p>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {choices.map(([value, Icon, label, detail]) => (
          <button key={value} disabled={busy} onClick={() => onChoose(value)} className="control-transition group flex flex-col items-start border border-pale bg-[#F9FCFE] p-5 text-left hover:-translate-y-px hover:border-mid hover:bg-white disabled:cursor-wait disabled:opacity-60">
            <Icon size={20} className="text-mid" aria-hidden="true" />
            <span className="mt-4 text-base font-extrabold tracking-[-.03em] text-ink">{label}</span>
            <span className="mt-1 text-sm leading-6 text-muted">{detail}</span>
          </button>
        ))}
      </div>
      {busy && <p className="mt-5 font-mono text-[11px] uppercase tracking-[.13em] text-muted">Drawing your questions…</p>}
    </section>
  );
}
