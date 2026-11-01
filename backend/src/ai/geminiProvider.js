// Google Gemini behind the provider interface (see provider.js). Server side only: the key never reaches the browser.
import { GoogleGenAI } from '@google/genai';
import { ProviderError } from './errors.js';

// Names change as Google retires models, so this is only a fallback: set GEMINI_MODEL to pick the one you want.
export const DEFAULT_MODEL = 'gemini-3.5-flash';

// Turns whatever the SDK threw into a ProviderError with a safe code. Raw provider text is never passed on.
export function mapError(error) {
  if (error instanceof ProviderError) return error;
  if (error?.name === 'AbortError') return new ProviderError('aborted');
  const status = Number(error?.status ?? error?.code ?? error?.error?.code);
  const text = String(error?.message || '');
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return new ProviderError('quota', `status ${status || 429}`);
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(text))) return new ProviderError('auth', `status ${status}`);
  return new ProviderError('unavailable', status ? `status ${status}` : error?.name || 'error');
}

export function createGeminiProvider({ apiKey, model, fallbackModel, client, retryDelayMs = 800 } = {}) {
  const ai = client || new GoogleGenAI({ apiKey });
  const modelName = model || DEFAULT_MODEL;
  const models = [modelName, ...(fallbackModel && fallbackModel !== modelName ? [fallbackModel] : [])];
  return {
    name: 'gemini',
    model: modelName,
    // While nothing has been shown yet: a briefly unavailable model is tried once more, and a model that is over quota
    // or still unavailable hands over to the fallback model (if one is set).
    async *stream(args) {
      let produced = false;
      let failure = null;
      for (const [index, name] of models.entries()) {
        for (let attempt = 0; attempt < (index === 0 ? 2 : 1); attempt++) {
          try {
            for await (const piece of this.attempt(args, name)) { produced = true; yield piece; }
            return;
          } catch (error) {
            if (produced || args.signal?.aborted || (error.code !== 'unavailable' && error.code !== 'quota')) throw error;
            failure = error;
            if (error.code === 'quota') break; // retrying the same model cannot help
            if (index === 0 && attempt === 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          }
        }
      }
      throw failure;
    },
    async *attempt({ system, contents, signal }, name) {
      let stream;
      try {
        stream = await ai.models.generateContentStream({
          model: name,
          contents: contents.map(({ role, text }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text }] })),
          config: { systemInstruction: system, maxOutputTokens: 1024, temperature: 0.6, abortSignal: signal }
        });
        let produced = false;
        let stop = null;
        for await (const chunk of stream) {
          if (signal?.aborted) throw new ProviderError('aborted');
          if (chunk?.promptFeedback?.blockReason) throw new ProviderError('blocked');
          const finish = chunk?.candidates?.[0]?.finishReason;
          if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') stop = finish;
          const text = chunk?.text;
          if (text) { produced = true; yield text; }
        }
        // Nothing came back and the model stopped for a safety reason: say so instead of showing an empty answer.
        if (!produced) throw new ProviderError(stop ? 'blocked' : 'unavailable', 'empty answer');
      } catch (error) {
        throw mapError(error);
      }
    }
  };
}
