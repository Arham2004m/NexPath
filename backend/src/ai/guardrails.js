// The cheap, deterministic layer in front of the model (the second layer is the system prompt).
import { CANARY } from './prompt.js';

export const MAX_INPUT_CHARS = 1000;

// Returns { ok: true, text } or { ok: false, message }.
export function cleanInput(value) {
  if (typeof value !== 'string') return { ok: false, message: 'Write a message first.' };
  // Drop control and invisible characters (keeping tabs and line breaks) and runaway blank lines.
  const text = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2028\u2029\u2066-\u2069\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return { ok: false, message: 'Write a message first.' };
  if (text.length > MAX_INPUT_CHARS) return { ok: false, message: `Keep your message under ${MAX_INPUT_CHARS} characters.` };
  return { ok: true, text };
}

const EXTRACTION = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,30}\b(previous|prior|above|earlier|all|your|the|these)\b.{0,20}\b(instructions?|prompts?|rules?|guidelines?|restrictions?)\b/i,
  /\b(reveal|show|print|repeat|display|leak|tell me|output|give me|what (is|are))\b.{0,40}\b(system prompt|your (initial |hidden |secret )?(prompt|instructions|rules)|hidden (prompt|instructions)|internal marker)\b/i,
  /\b(jailbreak|DAN mode|developer mode|do anything now)\b/i,
  /\b(pretend|act|behave)\b.{0,30}\b(no|without|free (of|from))\b.{0,15}\b(rules|restrictions|limits|filters|guidelines)\b/i
];
const CRISIS = /\b(kill myself|killing myself|end my life|suicide|suicidal|want to die|self[- ]?harm|hurt myself|no reason to live)\b/i;

export const REPLIES = {
  blocked: 'I can\'t help with that. I\'m here for career guidance, study strategy and your NexPath roadmap. Try asking something like "What should I focus on this week?" or "How do I get unstuck on graphs?"',
  crisis: 'I\'m really sorry you\'re feeling this way, and I\'m glad you said it. I can\'t give the support you deserve, but please talk to someone right now: a friend, a family member, or a counsellor you trust. If you are in India you can call Tele-MANAS at 14416 (free, 24/7); elsewhere, please contact your local emergency number or a crisis line. If you are in immediate danger, call emergency services. When you feel ready, I\'m here to help with your studies, one small step at a time.',
  leaked: 'I can\'t share that. I\'m here for career guidance, study strategy and your NexPath roadmap.'
};

// 'ok' | 'blocked' (blatant instruction override or prompt extraction) | 'crisis' (a message about self-harm).
export function screen(text) {
  if (CRISIS.test(text)) return 'crisis';
  return EXTRACTION.some((pattern) => pattern.test(text)) ? 'blocked' : 'ok';
}

export const leaksPrompt = (text) => text.includes(CANARY);
// Streaming holds back this many trailing characters so a marker split across two fragments is never shown.
export const HOLDBACK = CANARY.length - 1;
