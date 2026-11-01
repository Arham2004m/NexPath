// The mentor talks to a language model only through this small interface, so the model can be swapped without touching
// the route or the tests:
//   provider.stream({ system, contents, signal })  ->  async iterable of text fragments
// `contents` is [{ role: 'user' | 'assistant', text }] ending with the student's new message.
import { createGeminiProvider } from './geminiProvider.js';
import { ProviderError } from './errors.js';

export { ProviderError };

const unconfigured = {
  name: 'unconfigured',
  // eslint-disable-next-line require-yield
  async *stream() { throw new ProviderError('not_configured'); }
};

let override = null;
let cached = null; // { key, model, provider }

// Tests (and any future provider) inject here. Pass null to go back to the environment-based default.
export const setProvider = (provider) => { override = provider; };

export function getProvider() {
  if (override) return override;
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return unconfigured;
  const model = (process.env.GEMINI_MODEL || '').trim() || undefined;
  const fallbackModel = (process.env.GEMINI_FALLBACK_MODEL || '').trim() || undefined;
  if (!cached || cached.apiKey !== apiKey || cached.model !== model || cached.fallbackModel !== fallbackModel) cached = { apiKey, model, fallbackModel, provider: createGeminiProvider({ apiKey, model, fallbackModel }) };
  return cached.provider;
}
