import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Sidebar from '../components/home/Sidebar';
import Topbar from '../components/home/Topbar';
import Markdown from '../lib/markdown';
import { clearHistory, getHistory, streamMessage } from '../services/chatApi';

const MAX_CHARS = 1000;
const STARTERS = [
  'Why is DSA important for FAANG?',
  'Should I skip CN for placements?',
  'What do I do if I\'m stuck on graphs?',
  'What should I focus on this week?'
];

function Bubble({ message }) {
  const mine = message.role === 'user';
  return (
    <li className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] px-4 py-3 text-[15px] leading-7 sm:max-w-[80%] ${mine ? 'bg-deep text-cream' : 'border border-pale bg-white text-ink'}`}>
        {mine ? <p className="whitespace-pre-wrap break-words">{message.content}</p>
          : message.streaming && !message.content ? <p className="text-muted" aria-label="The mentor is writing">Thinking…</p>
            : <div className="break-words"><Markdown text={message.content} /></div>}
        {message.status === 'failed' && <p className="mt-2 text-xs font-bold text-muted">No reply. Try asking again.</p>}
      </div>
    </li>
  );
}

export default function MentorPage() {
  const [menu, setMenu] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [more, setMore] = useState({ has: false, before: null, busy: false });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState(null); // { message, tone }
  const [confirmClear, setConfirmClear] = useState(false);
  const list = useRef(null);
  const stick = useRef(true); // keep following new text unless the student scrolled up
  const abort = useRef(null);
  const alive = useRef(true);
  const counter = useRef(0);

  const loadFirst = useCallback(async () => {
    setLoadError(null);
    try {
      const page = await getHistory();
      if (!alive.current) return;
      setMessages(page.messages);
      setMore({ has: page.hasMore, before: page.nextBefore, busy: false });
      setLoaded(true);
    } catch (error) { if (alive.current) setLoadError(error.message); }
  }, []);

  useEffect(() => {
    alive.current = true;
    loadFirst();
    return () => { alive.current = false; abort.current?.abort(); };
  }, [loadFirst]);

  // Follow the newest text, unless the student has scrolled up to read.
  useLayoutEffect(() => {
    const node = list.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [messages, loaded]);

  const onScroll = () => {
    const node = list.current;
    if (node) stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
  };

  const loadEarlier = async () => {
    const node = list.current;
    const before = node ? node.scrollHeight : 0;
    setMore((current) => ({ ...current, busy: true }));
    try {
      const page = await getHistory({ before: more.before });
      if (!alive.current) return;
      stick.current = false;
      setMessages((current) => [...page.messages, ...current]);
      setMore({ has: page.hasMore, before: page.nextBefore, busy: false });
      // Keep the message the student was reading in place.
      requestAnimationFrame(() => { if (list.current) list.current.scrollTop += list.current.scrollHeight - before; });
    } catch (error) {
      if (!alive.current) return;
      setMore((current) => ({ ...current, busy: false }));
      setProblem({ message: error.message });
    }
  };

  const ask = useCallback(async (text) => {
    const question = text.trim();
    if (!question || question.length > MAX_CHARS || sending) return;
    counter.current += 1;
    const userId = `local-user-${counter.current}`;
    const replyId = `local-reply-${counter.current}`;
    const controller = new AbortController();
    abort.current = controller;
    setProblem(null);
    setSending(true);
    stick.current = true;
    setInput('');
    setMessages((current) => [...current, { id: userId, role: 'user', content: question, status: 'ok' }, { id: replyId, role: 'assistant', content: '', streaming: true, status: 'ok' }]);
    try {
      const result = await streamMessage(question, {
        signal: controller.signal,
        onDelta: (piece) => { if (alive.current) setMessages((current) => current.map((m) => (m.id === replyId ? { ...m, content: m.content + piece } : m))); }
      });
      if (!alive.current) return;
      // The stored versions replace the streamed text (the server's final text is the authority).
      setMessages((current) => current.map((m) => (m.id === userId ? result.question : m.id === replyId ? result.message : m)));
    } catch (error) {
      if (!alive.current) return;
      if (error.name === 'AbortError') {
        // Stopped by the student: keep what was already written; with nothing written, mark the question unanswered.
        setMessages((current) => current.flatMap((m) => {
          if (m.id === replyId) return m.content.trim() ? [{ ...m, streaming: false }] : [];
          if (m.id === userId) return [{ ...m, status: current.find((x) => x.id === replyId)?.content.trim() ? 'ok' : 'failed' }];
          return [m];
        }));
      } else if (error.status === 429 || error.status === 400 || error.status === 409) {
        // Refused before anything was stored: take the question back so nothing is lost.
        setMessages((current) => current.filter((m) => m.id !== userId && m.id !== replyId));
        setInput((current) => current || question);
        setProblem({ message: error.message, tone: error.status === 429 ? 'limit' : 'notice' });
      } else {
        setMessages((current) => current.filter((m) => m.id !== replyId).map((m) => (m.id === userId ? { ...m, status: 'failed' } : m)));
        setProblem({ message: error.message, tone: 'error' });
      }
    } finally {
      if (alive.current) setSending(false);
      if (abort.current === controller) abort.current = null;
    }
  }, [sending]);

  const submit = (event) => { event.preventDefault(); ask(input); };
  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(input); }
  };

  const clear = async () => {
    setConfirmClear(false);
    setProblem(null);
    try {
      await clearHistory();
      if (!alive.current) return;
      setMessages([]);
      setMore({ has: false, before: null, busy: false });
    } catch (error) { if (alive.current) setProblem({ message: error.message, tone: 'error' }); }
  };

  const tooLong = input.length > MAX_CHARS;
  const empty = loaded && messages.length === 0;

  return (
    <div className="app-shell min-h-screen lg:flex">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      {menu && <button onClick={() => setMenu(false)} className="fixed inset-0 z-20 bg-ink/45 lg:hidden" aria-label="Close navigation" />}
      <div className="workspace-shell min-w-0 flex-1">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-3xl p-6 sm:p-9 lg:p-12">
          <div className="dashboard-arrival">
            <header>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[.14em] text-mid">AI mentor</p>
              <h1 className="mt-4 text-4xl font-extrabold leading-[.94] tracking-[-.065em] text-ink sm:text-5xl">Ask your mentor.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted">Career advice, study strategy and your roadmap. The mentor knows your goal, your week and your pace, but not your name or email.</p>
            </header>

            <section className="surface-card mt-8 flex flex-col" aria-label="Conversation">
              {loadError && (
                <div role="alert" className="p-6 text-sm text-ink">
                  <p>{loadError}</p>
                  <button type="button" onClick={loadFirst} className="control-transition mt-3 min-h-10 border border-pale bg-white px-4 font-extrabold hover:border-mid">Try again</button>
                </div>
              )}
              {!loaded && !loadError && <div role="status" aria-label="Loading the conversation" className="m-6 h-40 animate-pulse bg-warm" />}

              {loaded && (
                <div ref={list} onScroll={onScroll} className="max-h-[56vh] min-h-[280px] overflow-y-auto p-4 sm:p-6">
                  {more.has && (
                    <div className="mb-4 text-center">
                      <button type="button" onClick={loadEarlier} disabled={more.busy} className="control-transition min-h-9 border border-pale bg-white px-4 text-sm font-extrabold hover:border-mid disabled:opacity-60">{more.busy ? 'Loading…' : 'Load earlier messages'}</button>
                    </div>
                  )}
                  {empty && (
                    <div>
                      <p className="text-[15px] leading-7 text-muted">Not sure where to start? Try one of these:</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {STARTERS.map((starter) => (
                          <button key={starter} type="button" onClick={() => ask(starter)} disabled={sending} className="control-transition min-h-10 border border-pale bg-white px-4 text-left text-sm font-bold text-ink hover:border-mid disabled:opacity-60">{starter}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <ol role="log" aria-label="Messages" aria-live="polite" className="space-y-4">
                    {messages.map((message) => <Bubble key={message.id} message={message} />)}
                  </ol>
                </div>
              )}

              {problem && (
                <p role="alert" className={`mx-4 mb-2 border px-4 py-3 text-sm font-bold leading-6 sm:mx-6 ${problem.tone === 'limit' ? 'border-mid bg-warm text-ink' : 'border-pale bg-white text-ink'}`}>{problem.message}</p>
              )}

              <form onSubmit={submit} className="border-t border-pale p-4 sm:p-6">
                <label htmlFor="mentor-input" className="sr-only">Your message</label>
                <textarea
                  id="mentor-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown}
                  rows={3} placeholder="Ask about your roadmap, a topic, or your next step…" aria-describedby="mentor-hint"
                  className="block w-full resize-y border border-pale bg-white p-3 text-[15px] leading-6 text-ink outline-none focus:border-mid"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p id="mentor-hint" className={`text-xs ${tooLong ? 'font-bold text-ink' : 'text-muted'}`}>
                    <span aria-live="polite">{input.length}/{MAX_CHARS}{tooLong ? ' – too long' : ''}</span> · Enter to send, Shift+Enter for a new line
                  </p>
                  <div className="flex items-center gap-2">
                    {sending && <button type="button" onClick={() => abort.current?.abort()} className="control-transition min-h-10 border border-pale bg-white px-4 text-sm font-extrabold text-ink hover:border-mid">Stop</button>}
                    <button type="submit" disabled={sending || !input.trim() || tooLong} className="control-transition min-h-10 bg-deep px-5 text-sm font-extrabold text-cream hover:bg-ink disabled:opacity-50">Send</button>
                  </div>
                </div>
              </form>
            </section>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-xs leading-5 text-muted">The mentor is an AI and can make mistakes. Check important facts, and do not share passwords or personal details.</p>
              {loaded && messages.length > 0 && !confirmClear && (
                <button type="button" onClick={() => setConfirmClear(true)} disabled={sending} className="text-xs font-bold text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50">Clear conversation</button>
              )}
              {confirmClear && (
                <span className="flex items-center gap-3 text-xs">
                  <span className="font-bold text-ink">Delete this whole conversation?</span>
                  <button type="button" onClick={clear} className="font-extrabold text-ink underline underline-offset-4">Yes, delete</button>
                  <button type="button" onClick={() => setConfirmClear(false)} className="font-bold text-muted underline underline-offset-4">Cancel</button>
                </span>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
