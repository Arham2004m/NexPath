import { openStream, request } from './api';

const chatError = (message, extra = {}) => Object.assign(new Error(message), extra);

// Splits received text into complete server-sent events and whatever is left over (an event cut in half).
export function parseEvents(buffer) {
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = blocks.pop();
  const events = [];
  for (const block of blocks) {
    const name = /^event: (.*)$/m.exec(block)?.[1];
    const raw = /^data: (.*)$/m.exec(block)?.[1];
    if (!name || raw === undefined) continue;
    try { events.push({ name, data: JSON.parse(raw) }); } catch { /* ignore a damaged event */ }
  }
  return { events, rest };
}

// Sends a question and reports the answer piece by piece. Resolves with { question, message } (the stored versions;
// `message.content` is the final text and replaces whatever was streamed). Rejects with an Error that has `code`,
// `status` and, when the hourly limit is hit, `retryAfterSeconds`. An aborted request rejects with an AbortError.
export async function streamMessage(message, { signal, onDelta } = {}) {
  const response = await openStream('/chat/messages', { method: 'POST', body: JSON.stringify({ message }), signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw chatError(body.message || 'Could not send your message. Please try again.', { code: body.code, status: response.status, retryAfterSeconds: body.retryAfterSeconds });
  }
  if (!response.body) throw chatError('Your browser cannot show streamed replies.', { code: 'UNSUPPORTED' });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: !done });
      const parsed = parseEvents(done ? `${buffer}\n\n` : buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.name === 'delta') onDelta?.(event.data.text);
        else if (event.name === 'done') result = event.data;
        else if (event.name === 'error') throw chatError(event.data.message || 'The mentor could not answer.', { code: event.data.code || 'FAILED' });
      }
      if (done) break;
    }
  } catch (error) {
    if (error.name === 'AbortError' || error.code) throw error;
    throw chatError('The connection was lost before the reply finished. Please try again.', { code: 'INTERRUPTED' });
  }
  if (!result) throw chatError('The reply was cut off. Please try again.', { code: 'INTERRUPTED' });
  return result;
}

export const getHistory = ({ before, limit = 30 } = {}) => request(`/chat/history?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
export const clearHistory = () => request('/chat/history', { method: 'DELETE' });
