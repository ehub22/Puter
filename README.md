# PuterChat

A polished, responsive AI chat application inspired by the usability of Duck.ai and built on **[Puter.js](https://docs.puter.com)** — no backend, no API keys, no build step. Streaming responses, multi-model support, Markdown rendering, and local-only conversation history.

## ✨ Features

- **Multi-model chat** — curated model dropdown (GPT, Claude, Gemini, DeepSeek, Llama…) that also auto-discovers new models at runtime via `puter.ai.listModels()`
- **Streaming responses** with a **Stop** button (send is disabled while a request runs)
- **Conversations** — start, continue, rename, delete, clear; grouped by date in the sidebar
- **Context-aware** — the full relevant message history (plus optional system prompt) is sent with every request
- **Markdown rendering** — headings, lists, tables, inline code, and code blocks with a copy button; sanitized with DOMPurify to block script injection
- **Copy** any assistant message, **Regenerate** the latest response
- **Persistence** — conversations & settings stored in `localStorage`, surviving reloads
- **Settings** — light/dark/system theme, streaming toggle, system prompt, temperature, max tokens, clear-all-data
- **Accessible & responsive** — keyboard-friendly (Enter / Shift+Enter, Ctrl/Cmd+K, Esc), ARIA live announcements, off-canvas sidebar on mobile
- **Graceful errors** — targeted handling for sign-in, rate limits, unavailable models, and network failures

## 📁 Project structure

```
├── index.html                      # App shell, icon sprite, SDK + library tags
├── styles.css                      # All styling (light/dark theme tokens)
├── favicon.svg
├── README.md
└── js/
    ├── main.js                     # Bootstrap & wiring between components
    ├── config.js                   # ⚙️ App config — EDIT THE MODEL LIST HERE
    ├── state.js                    # Conversation store + request-history builder
    ├── utils.js                    # Small helpers (uid, debounce, formatting)
    ├── services/
    │   ├── puter.service.js        # 🔌 ALL Puter.js API access (auth/chat/models)
    │   ├── storage.service.js      # localStorage persistence
    │   └── markdown.service.js     # marked + DOMPurify safe rendering
    └── ui/
        ├── sidebar.js              # Conversation list, new chat, auth chip
        ├── chat-view.js            # Messages, streaming, composer, header
        ├── settings-modal.js       # Settings dialog
        └── toast.js                # Toasts + confirm dialogs
```

## 🚀 Setup & running locally

There is nothing to install and no keys to configure. Because the app uses ES modules, serve it over HTTP (opening `index.html` via `file://` will not work):

```bash
# Option A — Python
cd Puter
python3 -m http.server 8080
# → open http://localhost:8080

# Option B — Node
npx serve .
```

**First message:** when you send your first prompt, Puter opens its official sign-in popup. Sign in with (or create) a Puter account — AI usage is billed to *your own* account under Puter's [User-Pays model](https://docs.puter.com/user-pays-model/). The app itself costs nothing to host.

## 🔌 Puter.js integration

The SDK loads from the official CDN in `index.html`:

```html
<script src="https://js.puter.com/v2/"></script>
```

All API calls live in `js/services/puter.service.js`:

```js
// Full history → model keeps context between turns
const response = await puter.ai.chat(
  [
    { role: 'system', content: 'You are a helpful assistant.' }, // optional
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi! How can I help?' },
    { role: 'user', content: 'What is Puter?' },
  ],
  { model: 'gpt-5.6-luna', stream: true, temperature: 0.7, max_tokens: 1024, normalize: true }
);

for await (const part of response) {
  console.log(part.text); // streamed chunks
}
```

Authentication and billing are fully managed by Puter.js (`puter.auth.signIn()` popup, per-user usage limits). This app stores **no credentials** and does not bypass any limit — if the user hits their Puter usage cap, the app shows the rate-limit message and waits.

## ⚙️ Configuration

Everything lives in `js/config.js`:

| Setting | Purpose |
|---|---|
| `models` | **The model list.** Add/remove/edit entries; each is `{ id, name, provider, tagline }`. The `id` is passed straight to `puter.ai.chat()`. |
| `defaultModel` | Model used for new conversations |
| `maxContextMessages` | Cap on history messages sent per request (limits token usage; the UI keeps the full history) |
| `suggestedPrompts` | Empty-state prompt chips |
| `defaultSettings` | Defaults for theme, streaming, system prompt, temperature, max tokens |
| `storageKeys` | Versioned `localStorage` keys |

**Model list updates:** if Puter adds models, you usually don't need to touch anything — at startup the app calls `puter.ai.listModels()` and appends every discovered model under *“More models from Puter”*. The curated list in `config.js` only controls the featured entries and their display names.

## 💾 Conversation persistence

Conversations are stored in `localStorage` under `puterchat:v1:conversations`:

```js
{
  id: "unique-conversation-id",
  title: "New conversation",
  model: "selected-model",
  messages: [
    { role: "user",      content: "Hello",             timestamp: 1757097600000 },
    { role: "assistant", content: "Hi! How can I help?", timestamp: 1757097601000 }
  ],
  createdAt: 1757097600000,
  updatedAt: 1757097601000
}
```

Writes are debounced during streaming and flushed on tab hide/unload. Settings and the active conversation id are persisted under their own versioned keys. *“Clear all stored conversations”* in Settings wipes everything.

## 🌐 Deploying to static hosting

The app is 100% static — publish the repository root as-is to any static host:

- **GitHub Pages** — Settings → Pages → Deploy from branch → `/ (root)`
- **Netlify** — drag-and-drop the folder, or connect the repo (no build command, publish dir `.`)
- **Vercel** — import the repo with the *Other* framework preset (output `.`)
- **Cloudflare Pages** — connect the repo, build command empty, output `/`
- **Puter hosting** (fittingly):
  ```js
  await puter.fs.mkdir('my-chat-app', { createMissingParents: true });
  // …upload the files…
  await puter.hosting.create('my-chat-subdomain', 'my-chat-app');
  ```

No environment variables, secrets, or server functions are needed.

## 🔒 Privacy, authentication, errors & history

- **Privacy** — Conversations are stored **only in your browser's `localStorage`**. Nothing is uploaded to any server by this app. Prompts are sent to Puter's AI gateway solely to generate the reply you asked for. There are no analytics or tracking scripts.
- **Authentication** — Handled entirely by Puter.js: an official popup sign-in on first use, tokens managed by Puter, and no credentials ever present in this codebase. Signing out is available in the sidebar.
- **Errors** — Every failure is classified (`auth`, `rate-limit`, `model-unavailable`, `network`, unknown) and shown as an actionable card: *Sign in*, *Try again*, or *Choose another model*. Partial answers from interrupted streams are preserved.
- **History & context** — The complete conversation (capped at `maxContextMessages` most recent messages) plus your optional system prompt is sent with each request, so the model maintains context. Regenerate re-sends the identical history; the last response is shown with copy/regenerate controls.

## ⌨️ Keyboard shortcuts

| Keys | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Ctrl/Cmd+K` | New chat |
| `Esc` | Close menus / dialogs |

## 📄 Credits & license

Built with [Puter.js](https://docs.puter.com) (AI & auth), [marked](https://github.com/markedjs/marked) (Markdown), and [DOMPurify](https://github.com/cure53/DOMPurify) (sanitization).
