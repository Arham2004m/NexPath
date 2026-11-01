import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MentorPage from '../src/pages/MentorPage';
import Markdown from '../src/lib/markdown';
import { clearHistory, getHistory, parseEvents, streamMessage } from '../src/services/chatApi';
import { onSessionExpired, setAccessToken } from '../src/services/api';
import { deferred, renderPage } from './helpers';

vi.mock('../src/services/chatApi', async (importOriginal) => ({
  ...(await importOriginal()),
  streamMessage: vi.fn(), getHistory: vi.fn(), clearHistory: vi.fn()
}));

const msg = (id, role, content, status = 'ok') => ({ id, role, content, status, createdAt: '2026-01-05T10:00:00.000Z' });
const page = (messages = [], extra = {}) => ({ messages, hasMore: false, nextBefore: null, ...extra });
const problem = (message, extra = {}) => Object.assign(new Error(message), extra);
const show = () => renderPage(<MentorPage />, { path: '/mentor' });
const box = () => screen.getByRole('textbox', { name: /your message/i });
const send = () => screen.getByRole('button', { name: 'Send' });

beforeEach(() => { getHistory.mockResolvedValue(page()); });

describe('mentor page', () => {
  it('shows starter questions for a new conversation and sends one when clicked', async () => {
    streamMessage.mockResolvedValue({ question: msg('q1', 'user', 'Why is DSA important for FAANG?'), message: msg('a1', 'assistant', 'Because interviews test it.') });
    show();
    const starter = await screen.findByRole('button', { name: 'Why is DSA important for FAANG?' });
    expect(screen.getByRole('button', { name: 'Should I skip CN for placements?' })).toBeInTheDocument();
    await userEvent.click(starter);
    expect(streamMessage).toHaveBeenCalledWith('Why is DSA important for FAANG?', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(await screen.findByText('Because interviews test it.')).toBeInTheDocument();
    expect(screen.queryByText(/Not sure where to start/)).not.toBeInTheDocument();
  });

  it('shows the saved conversation', async () => {
    getHistory.mockResolvedValue(page([msg('1', 'user', 'Hello mentor'), msg('2', 'assistant', 'Hello! How can I help?')]));
    show();
    expect(await screen.findByText('Hello mentor')).toBeInTheDocument();
    expect(screen.getByText('Hello! How can I help?')).toBeInTheDocument();
    expect(screen.getByRole('log', { name: 'Messages' })).toBeInTheDocument();
  });

  it('streams the reply into place and ends with the stored final text', async () => {
    const finish = deferred();
    streamMessage.mockImplementation(async (text, { onDelta }) => {
      onDelta('Graphs are ');
      onDelta('about **connections**.');
      return finish.promise;
    });
    show();
    await userEvent.type(await screen.findByRole('textbox', { name: /your message/i }), 'Help with graphs');
    await userEvent.click(send());
    expect(await screen.findByText('connections')).toBeInTheDocument(); // rendered bold while streaming
    expect(screen.getByText('Help with graphs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(send()).toBeDisabled();
    expect(box()).toHaveValue('');
    finish.resolve({ question: msg('q', 'user', 'Help with graphs'), message: msg('a', 'assistant', 'FINAL text from the server') });
    expect(await screen.findByText('FINAL text from the server')).toBeInTheDocument();
    expect(screen.queryByText('connections')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('sends on Enter, adds a new line on Shift+Enter, and ignores an empty message', async () => {
    streamMessage.mockResolvedValue({ question: msg('q', 'user', 'two lines'), message: msg('a', 'assistant', 'ok') });
    show();
    const input = await screen.findByRole('textbox', { name: /your message/i });
    expect(send()).toBeDisabled();
    await userEvent.type(input, '{Enter}');
    expect(streamMessage).not.toHaveBeenCalled();
    await userEvent.type(input, 'two{Shift>}{Enter}{/Shift}lines');
    expect(input).toHaveValue('two\nlines');
    await userEvent.type(input, '{Enter}');
    expect(streamMessage).toHaveBeenCalledTimes(1);
    expect(streamMessage.mock.calls[0][0]).toBe('two\nlines');
  });

  it('counts characters and will not send more than 1000', async () => {
    show();
    const input = await screen.findByRole('textbox', { name: /your message/i });
    expect(screen.getByText(/^0\/1000/)).toBeInTheDocument();
    await userEvent.click(input);
    await userEvent.paste('a'.repeat(1001));
    expect(screen.getByText(/1001\/1000 – too long/)).toBeInTheDocument();
    expect(send()).toBeDisabled();
    await userEvent.type(input, '{Enter}');
    expect(streamMessage).not.toHaveBeenCalled();
  });

  it('puts the question back and explains when the hourly limit is reached', async () => {
    streamMessage.mockRejectedValue(problem('You have reached the limit of 20 mentor messages per hour. Try again in about 30 minute(s).', { status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 1800 }));
    show();
    await userEvent.type(await screen.findByRole('textbox', { name: /your message/i }), 'One more please');
    await userEvent.click(send());
    expect(await screen.findByRole('alert')).toHaveTextContent(/limit of 20 mentor messages per hour/);
    expect(box()).toHaveValue('One more please');
    expect(screen.queryByText('One more please', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('shows a mentor failure kindly and marks the question as unanswered', async () => {
    streamMessage.mockImplementation(async (text, { onDelta }) => { onDelta('Half an ans'); throw problem('The mentor could not answer just now. Please try again.', { code: 'unavailable' }); });
    show();
    await userEvent.type(await screen.findByRole('textbox', { name: /your message/i }), 'What is a heap?');
    await userEvent.click(send());
    expect(await screen.findByRole('alert')).toHaveTextContent('The mentor could not answer just now.');
    expect(screen.getByText('What is a heap?')).toBeInTheDocument();
    expect(screen.getByText(/No reply/)).toBeInTheDocument();
    expect(screen.queryByText(/Half an ans/)).not.toBeInTheDocument();
    expect(send()).toBeDisabled(); // empty box again, ready for a new question
  });

  it('lets the student stop a reply and keeps the part already written', async () => {
    streamMessage.mockImplementation((text, { onDelta, signal }) => new Promise((resolve, reject) => {
      onDelta('Start of a long answer');
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    show();
    await userEvent.type(await screen.findByRole('textbox', { name: /your message/i }), 'Explain everything');
    await userEvent.click(send());
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('Start of a long answer')).toBeInTheDocument();
    expect(screen.queryByText(/No reply/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument());
  });

  it('marks a stopped question with nothing written as unanswered', async () => {
    streamMessage.mockImplementation((text, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    show();
    await userEvent.type(await screen.findByRole('textbox', { name: /your message/i }), 'Quick one');
    await userEvent.click(send());
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(await screen.findByText(/No reply/)).toBeInTheDocument();
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
  });

  it('loads earlier messages in front of the current ones', async () => {
    getHistory.mockResolvedValueOnce(page([msg('3', 'user', 'Newest question')], { hasMore: true, nextBefore: 'c1' }));
    getHistory.mockResolvedValueOnce(page([msg('1', 'user', 'Oldest question')]));
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Load earlier messages' }));
    expect(getHistory).toHaveBeenLastCalledWith({ before: 'c1' });
    const items = within(await screen.findByRole('log')).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Oldest question', 'Newest question']);
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument();
  });

  it('clears the conversation only after confirming', async () => {
    getHistory.mockResolvedValue(page([msg('1', 'user', 'Keep me?'), msg('2', 'assistant', 'Maybe.')]));
    clearHistory.mockResolvedValue({ deleted: 2 });
    show();
    await screen.findByText('Keep me?');
    await userEvent.click(screen.getByRole('button', { name: 'Clear conversation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(clearHistory).not.toHaveBeenCalled();
    expect(screen.getByText('Keep me?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear conversation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(screen.queryByText('Keep me?')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Why is DSA important for FAANG?' })).toBeInTheDocument();
  });

  it('offers a retry when the history cannot be loaded', async () => {
    getHistory.mockRejectedValueOnce(problem('Could not reach the server. Check your connection and try again.'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Should I skip CN for placements?' })).toBeInTheDocument();
  });

  it('warns that the mentor is an AI', async () => {
    show();
    expect(await screen.findByText(/can make mistakes/)).toBeInTheDocument();
  });

  it('stops the request when the page is left', async () => {
    let signal;
    streamMessage.mockImplementation((text, options) => { signal = options.signal; return new Promise(() => {}); });
    const { unmount } = show();
    await userEvent.type(await screen.findByRole('textbox', { name: /your message/i }), 'Hello');
    await userEvent.click(send());
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

describe('markdown', () => {
  it('renders formatting, lists, code and safe links', () => {
    render(<Markdown text={'Intro with **bold**, *italic* and `code`.\n\n- first\n- second\n\n1. one\n2. two\n\n```\nlet x = 1;\n```\nSee [docs](https://example.com/a?b=1).'} />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('let x = 1;').closest('pre')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/a?b=1');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('never turns the model\'s text into live HTML or unsafe links', () => {
    const { container } = render(<Markdown text={'<img src=x onerror=alert(1)> <script>alert(1)</script>\n\n[bad](javascript:alert(1)) [worse](data:text/html,hi)'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('copes with an unfinished code block and empty text', () => {
    const { container } = render(<Markdown text={'Here:\n```js\nconst a = '} />);
    expect(container.querySelector('pre')).toHaveTextContent('const a =');
    const empty = render(<Markdown text="" />);
    expect(empty.container).toBeEmptyDOMElement();
  });
});

describe('streaming client', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); onSessionExpired(null); });
  const sse = (...events) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  const streamResponse = (chunks, status = 200) => {
    const encoder = new TextEncoder();
    return { ok: status < 300, status, json: async () => ({}), body: new ReadableStream({ start(controller) { chunks.forEach((c) => controller.enqueue(encoder.encode(c))); controller.close(); } }) };
  };

  it('parses events even when they are split across network chunks', () => {
    const first = parseEvents('event: delta\ndata: {"text":"a"}\n\nevent: del');
    expect(first.events).toEqual([{ name: 'delta', data: { text: 'a' } }]);
    expect(first.rest).toBe('event: del');
    expect(parseEvents(`${first.rest}ta\ndata: {"text":"b"}\n\n`).events).toEqual([{ name: 'delta', data: { text: 'b' } }]);
    expect(parseEvents('event: x\ndata: {broken\n\n').events).toEqual([]);
  });

  it('reads deltas then the final result, with the token and the SSE accept header', async () => {
    const { streamMessage: real } = await vi.importActual('../src/services/chatApi');
    const text = sse(['start', { id: 'q' }], ['delta', { text: 'Hel' }], ['delta', { text: 'lo' }], ['done', { question: { id: 'q' }, message: { id: 'a', content: 'Hello' } }]);
    const cut = 37; // splits inside an event
    const fetchMock = vi.fn(async () => streamResponse([text.slice(0, cut), text.slice(cut)]));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('tok');
    const pieces = [];
    const result = await real('Hi', { onDelta: (p) => pieces.push(p) });
    expect(pieces).toEqual(['Hel', 'lo']);
    expect(result.message.content).toBe('Hello');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/chat\/messages$/);
    expect(options.headers.Authorization).toBe('Bearer tok');
    expect(options.headers.Accept).toBe('text/event-stream');
    expect(JSON.parse(options.body)).toEqual({ message: 'Hi' });
  });

  it('turns an error event, a refused request and a cut-off stream into errors', async () => {
    const { streamMessage: real } = await vi.importActual('../src/services/chatApi');
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([sse(['delta', { text: 'x' }], ['error', { code: 'quota', message: 'The mentor is very busy right now.' }])])));
    await expect(real('Hi')).rejects.toMatchObject({ code: 'quota', message: 'The mentor is very busy right now.' });

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ code: 'RATE_LIMITED', message: 'Slow down', retryAfterSeconds: 90 }) })));
    await expect(real('Hi')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 90, message: 'Slow down' });

    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([sse(['delta', { text: 'x' }])])));
    await expect(real('Hi')).rejects.toMatchObject({ code: 'INTERRUPTED' });
  });

  it('renews an expired session once and retries', async () => {
    const { streamMessage: real } = await vi.importActual('../src/services/chatApi');
    const ok = streamResponse([sse(['done', { question: {}, message: { content: 'fine' } }])]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ accessToken: 'fresh' }) })
      .mockResolvedValueOnce(ok);
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('old');
    expect((await real('Hi')).message.content).toBe('fine');
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh');
  });
});
