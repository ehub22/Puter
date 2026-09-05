/* =========================================================================
 * PUTER.JS SERVICE — the ONLY module that talks to Puter.
 * =========================================================================
 * HOW TO CONFIGURE PUTER.JS
 * -------------------------
 * 1. The SDK is included in index.html:
 *        <script src="https://js.puter.com/v2/"></script>
 *    There is nothing else to configure: no API key, no account setup,
 *    no environment variables. Puter.js manages the full auth flow.
 *
 * 2. Authentication ("User-Pays" model):
 *    When the user sends their first message, Puter opens its official
 *    sign-in popup. The user signs in with their OWN Puter account and
 *    their account is billed for AI usage — never the developer's. This
 *    app does not (and must not) embed credentials or bypass any limit.
 *
 * 3. Requests go through puter.ai.chat(messages, options) where
 *    `messages` is an array of { role: 'system'|'user'|'assistant',
 *    content: string } objects — the full relevant history, so the model
 *    keeps context between turns.
 *
 * To swap model lists, edit js/config.js — this module is model-agnostic.
 * ========================================================================= */

/** Resolve once the Puter.js SDK (and its AI namespace) is available. */
export function waitForSDK(timeoutMs = 15000) {
  if (window.puter && window.puter.ai) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.puter && window.puter.ai) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Puter.js failed to load. Check your internet connection and reload.'));
      }
    }, 100);
  });
}

/* ── Auth ────────────────────────────────────────────────────────────── */

export function isSignedIn() {
  try { return !!window.puter?.auth?.isSignedIn(); } catch { return false; }
}

/** Must be called from a user gesture (click) — it opens a popup. */
export async function signIn() {
  return window.puter.auth.signIn();
}

export function signOut() {
  try { window.puter.auth.signOut(); } catch (e) { console.warn('signOut failed', e); }
}

export async function getUser() {
  try { return await window.puter.auth.getUser(); } catch { return null; }
}

/* ── Models ──────────────────────────────────────────────────────────── */

/** Live list of models Puter currently exposes. Returns [] on failure so
 *  the UI can fall back to the curated list in config.js. Entries look
 *  like { id, provider, name?, aliases?, context?, max_tokens?, cost? }. */
export async function listModels() {
  try {
    const list = await window.puter.ai.listModels();
    return Array.isArray(list) ? list : [];
  } catch (err) {
    // Not signed in yet or endpoint unavailable — the curated list still works.
    console.warn('puter.ai.listModels() unavailable, using curated list only.', err);
    return [];
  }
}

/* ── Chat ────────────────────────────────────────────────────────────── */

/**
 * Send a chat completion request.
 *
 * @param {Object} p
 * @param {Array<{role:string, content:string}>} p.messages  Full relevant history.
 * @param {string}  p.model        Model id (see config.js).
 * @param {boolean} p.stream       Stream partial chunks via p.onChunk.
 * @param {number|null} p.temperature  0–2, or null for model default.
 * @param {number|null} p.maxTokens    Positive int, or null for model default.
 * @param {(fullText:string)=>void} p.onChunk   Called with accumulated text.
 * @param {()=>boolean} p.shouldStop  Polled between chunks → cooperative stop.
 * @returns {Promise<{text:string, stopped:boolean}>}
 */
export async function chat({ messages, model, stream = false, temperature = null, maxTokens = null, onChunk, shouldStop }) {
  const options = { model, stream, normalize: true };
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    options.temperature = Math.min(2, Math.max(0, temperature));
  }
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    options.max_tokens = Math.floor(maxTokens);
  }

  const response = await window.puter.ai.chat(messages, options);

  if (!stream) {
    return { text: extractText(response), stopped: false };
  }

  // Defensive: if the SDK ever returns a non-iterable for stream:true,
  // degrade gracefully to a one-shot extraction.
  if (!response || typeof response[Symbol.asyncIterator] !== 'function') {
    return { text: extractText(response), stopped: false };
  }

  let text = '';
  let stopped = false;
  const iterator = response[Symbol.asyncIterator]();
  while (true) {
    // Cooperative stop: the UI flips shouldStop() → we stop consuming and
    // close the stream. (Puter.js has no dedicated abort API for chat, so
    // stopping is client-side; the partial answer is kept.)
    if (shouldStop && shouldStop()) {
      stopped = true;
      try { await iterator.return?.(); } catch { /* already closed */ }
      break;
    }
    const { done, value } = await iterator.next();
    if (done) break;
    // Chunks carry incremental text in `part.text` (some reasoning models
    // also carry `part.reasoning`, which we intentionally don't display).
    const chunk = typeof value?.text === 'string' ? value.text : '';
    if (chunk) {
      text += chunk;
      onChunk?.(text);
    }
  }
  return { text, stopped };
}

/** Pull plain text out of any known Puter chat response shape:
 *  - string (some default models)
 *  - normalized OpenAI format:  { message: { content: "..." } }
 *  - native Anthropic format:   { message: { content: [{type:'text', text}] } }
 *  - { text: "..." } fallbacks                                         */
export function extractText(response) {
  if (response == null) return '';
  if (typeof response === 'string') return response;

  const content = response?.message?.content ?? response?.content ?? response?.text;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => (typeof block === 'string' ? block : block?.text ?? ''))
      .join('');
  }
  if (typeof response?.toString === 'function' && response.toString !== Object.prototype.toString) {
    const s = response.toString();
    if (s && s !== '[object Object]') return s;
  }
  return '';
}

/* ── Error classification ────────────────────────────────────────────── */

/** Map raw Puter/network errors to a kind + user-friendly message so the
 *  UI can show targeted help (sign-in button, retry, pick another model…). */
export function classifyError(err) {
  const raw = [
    err?.message,
    typeof err?.error === 'string' ? err.error : err?.error?.message,
    typeof err === 'string' ? err : '',
  ].filter(Boolean).join(' ');
  const lower = raw.toLowerCase();
  const code = String(err?.code ?? err?.status ?? '').toLowerCase();

  if (/auth|sign.?in|log.?in|unauthorized|permission|account is required/.test(lower) || /401|403/.test(code)) {
    return {
      kind: 'auth',
      friendly: 'Puter sign-in is required to use AI features.',
      hint: 'Use the “Sign in to Puter” button below, or send another message and complete the sign-in popup.',
      raw,
    };
  }
  if (/rate.?limit|too many|quota|usage.?limit|allowance|insufficient|spending|429/.test(lower) || /429/.test(code)) {
    return {
      kind: 'rate-limit',
      friendly: 'Usage limit reached for now.',
      hint: 'Your Puter account hit a rate or spending limit. Wait a moment and try again — limits are managed by Puter and cannot be bypassed.',
      raw,
    };
  }
  if (/not (found|available|supported)|unknown model|invalid model|unavailable|does not exist|no such model|unsupported model|404/.test(lower) || /404/.test(code)) {
    return {
      kind: 'model-unavailable',
      friendly: 'This model is currently unavailable.',
      hint: 'Pick a different model from the dropdown and try again. Models can change over time — the list refreshes automatically.',
      raw,
    };
  }
  if (/network|fetch|offline|timed? ?out|socket|failed to fetch|load failed|econn|503|502/.test(lower) || /502|503/.test(code)) {
    return {
      kind: 'network',
      friendly: 'Network problem while contacting Puter.',
      hint: 'Check your internet connection, then retry.',
      raw,
    };
  }
  return {
    kind: 'unknown',
    friendly: 'The request could not be completed.',
    hint: raw || 'Unknown error. Try again or pick another model.',
    raw,
  };
}
