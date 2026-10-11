import { BookOpen, ExternalLink, FileText, FlaskConical, GraduationCap, Lightbulb, PlayCircle, ScrollText } from 'lucide-react';

const icons = { video: PlayCircle, course: GraduationCap, article: FileText, reference: BookOpen, practice: FlaskConical, project: Lightbulb, book: BookOpen, paper: ScrollText };
const labels = { video: 'Video', course: 'Course', article: 'Article', reference: 'Official docs', practice: 'Practice', project: 'Project idea', book: 'Book / notes', paper: 'Paper' };

export default function ResourceList({ resources, compact = false }) {
  if (!resources?.length) return <p className="text-sm text-muted">Resources for this skill are being curated.</p>;
  return (
    <ul className="space-y-2">
      {resources.map((resource) => {
        const Icon = icons[resource.type] || FileText;
        return (
          <li key={resource.id || resource.url}>
            <a href={resource.url} target="_blank" rel="noopener noreferrer" className="control-transition group flex items-start gap-3 border border-[var(--rule)] bg-[#F9FCFE] px-3.5 py-3 hover:border-mid">
              <Icon size={16} className="mt-0.5 shrink-0 text-mid" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-snug text-ink group-hover:text-mid">{resource.title}<span className="sr-only"> (opens in a new tab)</span></span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[.1em] text-muted">
                  {labels[resource.type] || 'Resource'}{resource.provider ? ` · ${resource.provider}` : ''}{resource.free ? ' · Free' : resource.pricing ? ` · ${resource.pricing}` : ''}{!compact && resource.time ? ` · ${resource.time}` : ''}
                </span>
                {!compact && resource.why && <span className="mt-1 block text-xs leading-5 text-muted">{resource.why}</span>}
              </span>
              <ExternalLink size={13} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
