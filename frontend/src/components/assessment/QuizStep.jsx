import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Button from '../common/Button';

export const WEIGHTS = { easy: 1, medium: 2, hard: 3 };

export default function QuizStep({ domain, questions, isLast, onNext, onChange }) {
  const [selected, setSelected] = useState({});
  // Lets the page auto-submit the in-progress selections when the timer runs out.
  useEffect(() => { onChange?.(selected); }, [selected, onChange]);
  const answered = questions.filter((q) => selected[q.id] !== undefined).length;
  // Unanswered questions are submitted as -1, which the server scores as incorrect.
  const finish = () => onNext(Object.fromEntries(questions.map((q) => [q.id, selected[q.id] ?? -1])));

  return (
    <section className="mt-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold leading-tight tracking-[-.055em] text-ink sm:text-4xl">{domain.label}</h2>
          <p className="mt-2 text-[15px] text-muted">{questions.length} questions, randomly drawn for this attempt.</p>
        </div>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid">{answered} / {questions.length} answered</p>
      </header>

      <ol className="mt-7 space-y-5">
        {questions.map((q, qi) => (
          <li key={q.id} className="surface-card px-6 py-6 sm:px-8">
            <fieldset>
              <legend className="w-full">
                <span className="flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[.13em]">
                  <span className="text-mid">Q{qi + 1}</span>
                  <span className="bg-warm px-2 py-0.5 text-muted">{q.difficulty} · {WEIGHTS[q.difficulty]} pt{WEIGHTS[q.difficulty] > 1 ? 's' : ''}</span>
                </span>
                <span className="mt-3 block text-lg font-bold [font-variant-ligatures:none] [font-feature-settings:'calt'_0] leading-snug tracking-[-.025em] text-ink">{q.question}</span>
              </legend>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {q.options.map((option, oi) => {
                  const active = selected[q.id] === oi;
                  return (
                    <label key={oi} className={`control-transition flex cursor-pointer items-start gap-3 border px-4 py-3 text-[15px] leading-6 ${active ? 'border-mid bg-[#E7F4FC] font-bold text-ink' : 'border-pale bg-[#F9FCFE] text-ink hover:border-mid hover:bg-white'}`}>
                      <input type="radio" name={q.id} value={oi} checked={active} onChange={() => setSelected((s) => ({ ...s, [q.id]: oi }))} className="mt-1 accent-[var(--color-mid)]" />
                      <span className="[font-variant-ligatures:none] [font-feature-settings:'calt'_0]">{option}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-5 border-t-2 section-rule pt-6">
        <Button onClick={finish}>{isLast ? 'Finish and see results' : 'Next domain'} <ArrowRight size={16} /></Button>
        {answered < questions.length && <p className="text-sm text-muted">Unanswered questions count as incorrect.</p>}
      </div>
    </section>
  );
}
