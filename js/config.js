/* =========================================================================
 * APP CONFIGURATION
 * =========================================================================
 * PUTER.JS SETUP
 * --------------
 * Puter.js needs NO API keys, NO backend and NO build step. The SDK is
 * loaded with a single <script> tag in index.html:
 *
 *     <script src="https://js.puter.com/v2/"></script>
 *
 * After that, the global `window.puter` object provides everything this
 * app uses (see js/services/puter.service.js):
 *
 *     puter.ai.chat(messages, { model, stream, temperature, max_tokens })
 *     puter.ai.listModels()
 *     puter.auth.isSignedIn() / signIn() / signOut() / getUser()
 *
 * Authentication & billing follow Puter's official "User-Pays" model:
 * the first AI call opens a Puter-managed sign-in popup and every request
 * is billed against the USER's own Puter account. This app intentionally
 * stores no credentials and never bypasses limits, billing or auth.
 *
 * MODEL LIST
 * ----------
 * The curated dropdown is defined by MODELS below. To add, remove or
 * reorder models, just edit that array — nothing else needs to change.
 *
 * In addition, at runtime the app calls puter.ai.listModels() and appends
 * every model it discovers that is not listed here (grouped under
 * "More models from Puter"). So if Puter adds new models, they show up
 * automatically without any code change.
 *
 * Model id formats accepted by puter.ai.chat():
 *   - "gpt-5.6-luna"                        (plain id)
 *   - "openai/gpt-6-astra"                  (vendor-prefixed id)
 *   - "openrouter:meta-llama/llama-4-maverick" (OpenRouter catalog id)
 * ========================================================================= */

export const APP_CONFIG = {
  appName: 'PuterChat',
  tagline: 'Private, keyless AI chat — powered by Puter.js',

  /* Default model for brand-new conversations. Must be one of the ids in
   * MODELS below (or any other id Puter supports). */
  defaultModel: 'gpt-5.6-luna',

  /* ── EDIT THIS LIST TO CHANGE THE MODEL DROPDOWN ──────────────────────
   * id        → exact model id passed to puter.ai.chat()
   * name      → human-friendly label shown in the dropdown
   * provider  → vendor name shown next to the label
   * tagline   → short description (used as the option tooltip)
   * ──────────────────────────────────────────────────────────────────── */
  models: [
    { id: 'gpt-5.6-luna',        name: 'GPT-5.6 Luna',        provider: 'OpenAI',    tagline: 'Fast, affordable everyday chat (default)' },
    { id: 'gpt-6-astra',         name: 'GPT-6 Astra',         provider: 'OpenAI',    tagline: 'Most capable OpenAI model — reasoning & coding' },
    { id: 'gpt-5.6-sol',         name: 'GPT-5.6 Sol',         provider: 'OpenAI',    tagline: 'Flagship of the GPT-5.6 family' },
    { id: 'gpt-5.4-nano',        name: 'GPT-5.4 Nano',        provider: 'OpenAI',    tagline: 'Ultra-fast micro responses' },
    { id: 'claude-sonnet-5',     name: 'Claude Sonnet 5',     provider: 'Anthropic', tagline: 'Balanced analysis, writing and code' },
    { id: 'claude-opus-5',       name: 'Claude Opus 5',       provider: 'Anthropic', tagline: 'Deep reasoning for hard problems' },
    { id: 'claude-haiku-4-5',    name: 'Claude Haiku 4.5',    provider: 'Anthropic', tagline: 'Quick, lightweight answers' },
    { id: 'claude-fable-5-1',    name: 'Claude Fable 5.1',    provider: 'Anthropic', tagline: 'Frontier agentic coding & research' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', provider: 'Google', tagline: 'Snappy general-purpose chat' },
    { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'Google',   tagline: 'Long-horizon engineering workflows' },
    { id: 'deepseek-chat',       name: 'DeepSeek Chat',       provider: 'DeepSeek',  tagline: 'Strong open-weight general model' },
    { id: 'deepseek-reasoner',   name: 'DeepSeek Reasoner',   provider: 'DeepSeek',  tagline: 'Step-by-step reasoning model' },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B',        provider: 'OpenAI OSS', tagline: 'Open-source GPT-OSS family' },
    { id: 'openrouter:meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', provider: 'Meta · OpenRouter', tagline: 'Open-weights model via OpenRouter' },
  ],

  /* Cap on how many history messages are sent with each request. Keeps
   * token usage (and cost to the user) sane on very long conversations.
   * The full history always stays visible in the UI and in storage. */
  maxContextMessages: 60,

  /* Suggestions shown in the empty state. */
  suggestedPrompts: [
    { title: 'Explain a concept',   prompt: 'Explain how large language models work, in simple terms.' },
    { title: 'Write some code',     prompt: 'Write a JavaScript function that debounces another function, with usage examples.' },
    { title: 'Draft a message',     prompt: 'Draft a friendly email declining a meeting and proposing next week instead.' },
    { title: 'Brainstorm ideas',    prompt: 'Give me 10 creative names for a cozy coffee shop that also sells books.' },
  ],

  /* Default user settings (can be changed in the Settings dialog). */
  defaultSettings: {
    theme: 'system',        // 'light' | 'dark' | 'system'
    streaming: true,        // stream responses token-by-token
    systemPrompt: '',       // optional system prompt prepended to every request
    temperature: null,      // null → model default; 0–2 when set
    maxTokens: null,        // null → model default; positive integer when set
    lastModel: 'gpt-5.6-luna',
  },

  /* localStorage keys (versioned so future schema changes are painless). */
  storageKeys: {
    conversations: 'puterchat:v1:conversations',
    settings: 'puterchat:v1:settings',
    active: 'puterchat:v1:active',
  },
};
