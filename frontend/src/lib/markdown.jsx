// A small, safe renderer for the mentor's answers: paragraphs, lists, code, bold, italic and http(s) links.
// It builds React elements directly (never raw HTML), so nothing the model writes can run as markup.
import { Fragment } from 'react';

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;

export function renderInline(text, keyBase = 'i') {
  const out = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyBase}-${index++}`;
    if (match[1]) out.push(<code key={key} className="bg-warm px-1 font-mono text-[.9em]">{token.slice(1, -1)}</code>);
    else if (match[2]) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (match[3]) out.push(<em key={key}>{token.slice(1, -1)}</em>);
    else {
      const [, label, url] = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      out.push(<a key={key} href={url} target="_blank" rel="noopener noreferrer" className="font-bold text-mid underline underline-offset-4">{label}</a>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export default function Markdown({ text }) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (line.trim().startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i += 1; }
      i += 1; // closing fence (a reply still streaming has none yet)
      blocks.push({ type: 'code', text: code.join('\n') });
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line) && !BULLET.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) { items.push(pattern.exec(lines[i])[1]); i += 1; }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
    } else {
      const paragraph = [];
      while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('```') && !BULLET.test(lines[i]) && !NUMBERED.test(lines[i])) { paragraph.push(lines[i].replace(/^#{1,6}\s+/, '')); i += 1; }
      blocks.push({ type: 'p', lines: paragraph, heading: /^#{1,6}\s/.test(line) });
    }
  }
  return (
    <>
      {blocks.map((block, n) => {
        if (block.type === 'code') return <pre key={n} className="mt-3 overflow-x-auto bg-ink p-3 font-mono text-[13px] leading-6 text-cream first:mt-0"><code>{block.text}</code></pre>;
        if (block.type === 'ul' || block.type === 'ol') {
          const List = block.type;
          return <List key={n} className={`mt-3 space-y-1 pl-5 first:mt-0 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'}`}>{block.items.map((item, k) => <li key={k}>{renderInline(item, `${n}-${k}`)}</li>)}</List>;
        }
        return (
          <p key={n} className={`mt-3 first:mt-0 ${block.heading ? 'font-extrabold' : ''}`}>
            {block.lines.map((line, k) => <Fragment key={k}>{k > 0 && <br />}{renderInline(line, `${n}-${k}`)}</Fragment>)}
          </p>
        );
      })}
    </>
  );
}
