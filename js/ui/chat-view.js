/* =========================================================================
 * CHAT VIEW — header (title, model selector, menu), message list,
 * empty state, streaming assistant output, and the composer.
 * ========================================================================= */

import { APP_CONFIG } from '../config.js';
import { store, buildApiMessages } from '../state.js';
import * as puter from '../services/puter.service.js';
import { renderMarkdown, enhanceCodeBlocks, copyText } from '../services/markdown.service.js';
import { confirmDialog, toast } from './toast.js';
import { formatTime } from '../utils.js';

export class ChatView {
  /**
   * @param {Object} deps
   * @param {()=>void} deps.onToggleSidebar
   * @param {()=>Promise<void>} deps.onSignIn
   */
  constructor(deps) {
    this.deps = deps;
    this.currentConvId = null;
    this.generation = null;          // { convId, stopRequested }
    this.errorCardEl = null;
    this.stickToBottom = true;

    /* element refs */
    this.scrollEl = document.getElementById('messages-scroll');
    this.messagesEl = document.getElementById('messages');
    this.jumpBtn = document.getElementById('jump-latest');
    this.titleBtn = document.getElementById('conv-title');
    this.titleInput = document.getElementById('conv-title-input');
    this.modelSelect = document.getElementById('model-select');
    this.menuBtn = document.getElementById('conv-menu-btn');
    this.menuEl = document.getElementById('conv-menu');
    this.composer = document.getElementById('composer-input');
    this.sendBtn = document.getElementById('send-btn');
    this.srStatus = document.getElementById('sr-status');

    this.initModelSelect();
    this.bindEvents();

    /* re-sync header when store changes (messages re-render only on
     * conversation switch — see the subscriber). */
    store.subscribe(() => {
      this.syncHeader();
      const activeId = store.active?.id ?? null;
      if (activeId !== this.currentConvId) this.openConversation(store.active);
    });
  }

  get isGenerating() { return this.generation !== null; }
  get selectedModel() {
    return store.active?.model || store.settings.lastModel || APP_CONFIG.defaultModel;
  }

  /* ═══════════════════ HEADER ═══════════════════ */

  initModelSelect() {
    const sel = this.modelSelect;
    sel.textContent = '';
    const group = document.createElement('optgroup');
    group.label = 'Featured models';
    /* ── The dropdown is generated from APP_CONFIG.models in js/config.js.
          Edit that array to change the model list. ── */
    for (const m of APP_CONFIG.models) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = `${m.name} · ${m.provider}`;
      o.title = m.tagline || m.id;
      group.appendChild(o);
    }
    sel.appendChild(group);
    sel.value = this.selectedModel;
    if (sel.value !== this.selectedModel) this.ensureOption(this.selectedModel);
  }

  /** Append models discovered at runtime via puter.ai.listModels(). */
  mergeLiveModels(live) {
    if (!Array.isArray(live) || !live.length) return;
    const known = new Set(APP_CONFIG.models.map((m) => m.id));
    const extras = live.filter((m) =>
      m && typeof m.id === 'string' && !known.has(m.id) &&
      !(Array.isArray(m.aliases) && m.aliases.some((a) => known.has(a))));
    if (!extras.length) return;

    extras.sort((a, b) =>
      String(a.provider || '').localeCompare(String(b.provider || '')) ||
      String(a.name || a.id).localeCompare(String(b.name || b.id)));

    const group = document.createElement('optgroup');
    group.label = 'More models from Puter';
    for (const m of extras.slice(0, 200)) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.provider ? `${m.name || m.id} · ${m.provider}` : (m.name || m.id);
      o.title = m.id;
      group.appendChild(o);
    }
    this.modelSelect.appendChild(group);
    this.ensureOption(this.selectedModel);
  }

  /** Make sure an arbitrary model id is selectable (e.g. stored ones). */
  ensureOption(modelId) {
    if (!modelId) return;
    const sel = this.modelSelect;
    if ([...sel.options].some((o) => o.value === modelId)) { sel.value = modelId; return; }
    const o = document.createElement('option');
    o.value = modelId;
    o.textContent = modelId;
    sel.prepend(o);
    sel.value = modelId;
  }

  syncHeader() {
    const conv = store.active;
    this.titleBtn.textContent = conv ? conv.title : 'New conversation';
    this.titleBtn.disabled = !conv;
    this.menuBtn.disabled = !conv;
    const model = conv?.model || store.settings.lastModel || APP_CONFIG.defaultModel;
    this.ensureOption(model);
    if (this.modelSelect.value !== model) this.modelSelect.value = model;
  }

  bindEvents() {
    /* mobile sidebar toggle */
    document.getElementById('sidebar-toggle').addEventListener('click', () => this.deps.onToggleSidebar());

    /* model picker */
    this.modelSelect.addEventListener('change', () => {
      const model = this.modelSelect.value;
      if (store.active) store.setConversationModel(store.active.id, model);
      store.updateSettings({ lastModel: model });
    });

    /* title rename (header) */
    this.titleBtn.addEventListener('click', () => this.startTitleRename());
    this.titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.commitTitleRename(); }
      if (e.key === 'Escape') { this.cancelTitleRename(); }
    });
    this.titleInput.addEventListener('blur', () => this.commitTitleRename());

    /* conversation menu */
    this.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = this.menuEl.hidden;
      this.closeMenu();
      if (hidden && !this.menuBtn.disabled) {
        this.menuEl.hidden = false;
        this.menuEl.querySelector('button')?.focus();
      }
    });
    this.menuEl.addEventListener('click', (e) => {
      const action = e.target.closest('[data-menu]')?.dataset.menu;
      if (!action) return;
      this.closeMenu();
      if (action === 'rename') this.startTitleRename();
      if (action === 'clear') this.clearCurrentMessages();
      if (action === 'delete') this.deleteCurrentConversation();
    });
    document.addEventListener('click', (e) => {
      if (!this.menuEl.hidden && !this.menuEl.contains(e.target)) this.closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.menuEl.hidden) this.closeMenu();
    });

    /* composer */
    this.composer.addEventListener('input', () => { this.autosize(); this.updateSendButton(); });
    this.composer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (this.isGenerating) return;           // Enter does nothing mid-stream
        e.preventDefault();
        this.send(this.composer.value);
      }
    });
    this.sendBtn.addEventListener('click', () => {
      if (this.isGenerating) this.stopGeneration();
      else this.send(this.composer.value);
    });

    /* message actions (copy / regenerate) via delegation */
    this.messagesEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const msgEl = btn.closest('.msg');
      const action = btn.dataset.action;
      if (action === 'copy') this.copyAssistantMessage(btn, msgEl);
      if (action === 'regenerate') this.regenerate();
      if (action === 'dismiss-error') this.dismissErrorCard();
      if (action === 'retry') this.retryFromErrorCard();
      if (action === 'signin') this.deps.onSignIn();
      if (action === 'prompt') this.useSuggestedPrompt(btn.dataset.prompt);
    });

    /* scroll tracking → auto-scroll only when the user is near the bottom */
    this.scrollEl.addEventListener('scroll', () => {
      const el = this.scrollEl;
      this.stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
      this.jumpBtn.hidden = this.stickToBottom;
    });
    this.jumpBtn.addEventListener('click', () => this.scrollToBottom(true));
  }

  closeMenu() { this.menuEl.hidden = true; }

  startTitleRename() {
    const conv = store.active;
    if (!conv) return;
    this.closeMenu();
    this.titleBtn.hidden = true;
    this.titleInput.hidden = false;
    this.titleInput.value = conv.title;
    this.titleInput.focus();
    this.titleInput.select();
  }
  commitTitleRename() {
    if (this.titleInput.hidden) return;
    const conv = store.active;
    if (conv) store.rename(conv.id, this.titleInput.value);
    this.cancelTitleRename();
  }
  cancelTitleRename() {
    this.titleInput.hidden = true;
    this.titleBtn.hidden = false;
  }

  async clearCurrentMessages() {
    const conv = store.active;
    if (!conv) return;
    const ok = await confirmDialog({
      title: 'Clear this conversation?',
      message: 'All messages in this conversation will be removed. The conversation itself is kept.',
      confirmLabel: 'Clear messages',
      danger: true,
    });
    if (!ok) return;
    store.clearMessages(conv.id);
    this.openConversation(conv);
    toast('Conversation cleared', { type: 'info' });
  }

  async deleteCurrentConversation() {
    const conv = store.active;
    if (!conv) return;
    const ok = await confirmDialog({
      title: 'Delete conversation?',
      message: `“${conv.title}” will be permanently removed from this browser.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    store.deleteConversation(conv.id);
    this.openDraft();
  }

  /* ═══════════════════ RENDERING ═══════════════════ */

  openDraft() { this.openConversation(null); this.composer.focus(); }

  openConversation(conv) {
    this.currentConvId = conv?.id ?? null;
    this.dismissErrorCard();
    this.syncHeader();
    this.renderMessages(conv);
    this.scrollToBottom(true);
    this.updateSendButton();
  }

  renderMessages(conv) {
    this.messagesEl.textContent = '';
    this.messagesEl.setAttribute('aria-busy', 'false');

    if (!conv || conv.messages.length === 0) {
      this.messagesEl.appendChild(this.emptyState());
      return;
    }
    for (const msg of conv.messages) {
      this.messagesEl.appendChild(
        msg.role === 'user' ? this.userMessageEl(msg) : this.assistantMessageEl(msg));
    }
    this.refreshToolbars();
  }

  emptyState() {
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    const chips = APP_CONFIG.suggestedPrompts.map((p) => `
      <button type="button" class="suggestion" data-action="prompt" data-prompt="${p.prompt.replaceAll('"', '&quot;')}">
        <span class="suggestion-title">${p.title}</span>
        <span class="suggestion-prompt">${p.prompt}</span>
      </button>`).join('');
    wrap.innerHTML = `
      <div class="empty-logo" aria-hidden="true">
        <svg class="icon icon-logo"><use href="#icon-logo"></use></svg>
      </div>
      <h1>Hi! How can I help you today?</h1>
      <p>Ask anything, pick a model above, and your conversation stays in this browser.</p>
      <div class="suggestions">${chips}</div>`;
    return wrap;
  }

  userMessageEl(msg) {
    const el = document.createElement('div');
    el.className = 'msg user';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.content;      // plain text — no HTML injection possible
    if (msg.timestamp) bubble.title = formatTime(msg.timestamp);
    el.appendChild(bubble);
    return el;
  }

  assistantMessageEl(msg) {
    const el = document.createElement('div');
    el.className = 'msg assistant';
    el.append(this.avatarEl(), this.assistantMainEl(msg.content, msg.timestamp));
    return el;
  }

  avatarEl() {
    const av = document.createElement('div');
    av.className = 'avatar';
    av.setAttribute('aria-hidden', 'true');
    av.innerHTML = '<svg class="icon"><use href="#icon-sparkle"></use></svg>';
    return av;
  }

  assistantMainEl(content, timestamp) {
    const main = document.createElement('div');
    main.className = 'msg-main';
    if (timestamp) main.title = formatTime(timestamp);
    const md = document.createElement('div');
    md.className = 'md';
    md.innerHTML = renderMarkdown(content);
    enhanceCodeBlocks(md);
    const toolbar = document.createElement('div');
    toolbar.className = 'msg-toolbar';
    main.append(md, toolbar);
    return main;
  }

  /** Give the newest assistant message the Regenerate button, and every
   *  assistant message a Copy button. */
  refreshToolbars() {
    const assistantMsgs = [...this.messagesEl.querySelectorAll('.msg.assistant:not(.error-card)')];
    assistantMsgs.forEach((el, i) => {
      const toolbar = el.querySelector('.msg-toolbar');
      if (!toolbar) return;
      const badge = toolbar.querySelector('.stopped-badge'); // keep "Stopped"
      toolbar.textContent = '';
      toolbar.appendChild(this.toolButton('icon-copy', 'Copy message', 'copy'));
      if (i === assistantMsgs.length - 1 && !this.isGenerating) {
        toolbar.appendChild(this.toolButton('icon-refresh', 'Regenerate response', 'regenerate'));
      }
      if (badge) toolbar.appendChild(badge);
    });
  }

  toolButton(icon, label, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool-btn';
    b.dataset.action = action;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${icon}"></use></svg>`;
    return b;
  }

  async copyAssistantMessage(btn, msgEl) {
    const md = msgEl?.querySelector('.md');
    if (!md) return;
    const ok = await copyText(md.innerText);
    toast(ok ? 'Message copied to clipboard' : 'Could not copy message',
      { type: ok ? 'success' : 'error' });
  }

  useSuggestedPrompt(prompt) {
    this.composer.value = prompt;
    this.autosize();
    this.updateSendButton();
    this.composer.focus();
  }

  /* ═══════════════════ SENDING / GENERATION ═══════════════════ */

  async send(rawText) {
    const text = String(rawText || '').trim();
    if (!text || this.isGenerating) return;

    let conv = store.active;
    if (!conv) conv = store.createConversation({ model: this.selectedModel });

    store.addMessage(conv, 'user', text);   // persists + auto-titles + emits
    this.renderMessages(conv);
    this.composer.value = '';
    this.autosize();
    this.scrollToBottom(true);

    await this.generate(conv);
  }

  /** Run a completion for `conv` using the full relevant history. */
  async generate(conv) {
    const settings = store.settings;
    const apiMessages = buildApiMessages(conv, settings);
    if (!apiMessages.some((m) => m.role === 'user')) return;
    const model = conv.model || settings.lastModel || APP_CONFIG.defaultModel;

    // Offline / blocked SDK: tell the user instead of hanging.
    if (!window.puter?.ai) {
      try { await puter.waitForSDK(6000); } catch {
        toast('Puter.js is not available. Check your connection and reload the page.',
          { type: 'error', duration: 5200 });
        return;
      }
    }

    this.dismissErrorCard();
    const handle = this.appendAssistantPlaceholder(model);
    this.setGeneratingUI(true, conv.id);
    this.announce(`Generating a response with ${model}`);

    try {
      const { text, stopped } = await puter.chat({
        messages: apiMessages,
        model,
        stream: settings.streaming,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        onChunk: (fullText) => handle.update(fullText),
        shouldStop: () => this.generation?.stopRequested === true,
      });

      if (!text && stopped) {
        handle.remove();
        toast('Generation stopped', { type: 'info', duration: 2000 });
      } else {
        const finalText = text || '*(The model returned no content.)*';
        store.addMessage(conv, 'assistant', finalText);
        handle.finalize(finalText, { stopped, model });
      }
      this.announce('Assistant response complete');
    } catch (err) {
      console.error('Puter chat error:', err);
      const partial = handle.getPartial();
      if (partial && partial.trim()) {
        // Connection died mid-stream: keep what already arrived.
        store.addMessage(conv, 'assistant', partial);
        handle.finalize(partial, { stopped: true });
        const info = puter.classifyError(err);
        toast(`${info.friendly} (partial answer kept)`, { type: 'error', duration: 5000 });
      } else {
        handle.remove();
        const info = puter.classifyError(err);
        this.showErrorCard(info, conv, model);
      }
      this.announce('The request failed');
    } finally {
      if (this.generation?.convId === conv.id) this.generation = null;
      this.setGeneratingUI(false);
    }
  }

  stopGeneration() {
    if (this.generation) {
      this.generation.stopRequested = true;
      this.announce('Stopping generation');
    }
  }

  /** Regenerate the latest response: drop trailing assistant messages and
   *  resend the same history. */
  regenerate() {
    if (this.isGenerating) return;
    const conv = store.active;
    if (!conv || !conv.messages.some((m) => m.role === 'user')) return;
    store.popTrailingAssistants(conv);
    this.renderMessages(conv);
    this.scrollToBottom(true);
    this.generate(conv);
  }

  setGeneratingUI(on, convId) {
    if (on) this.generation = { convId, stopRequested: false };
    this.messagesEl.setAttribute('aria-busy', on ? 'true' : 'false');
    this.sendBtn.classList.toggle('is-stop', on);
    this.sendBtn.setAttribute('aria-label', on ? 'Stop generating' : 'Send message');
    this.sendBtn.innerHTML = on
      ? '<svg class="icon" aria-hidden="true"><use href="#icon-stop"></use></svg>'
      : '<svg class="icon" aria-hidden="true"><use href="#icon-send"></use></svg>';
    this.updateSendButton();
    this.refreshToolbars();
  }

  updateSendButton() {
    const hasText = this.composer.value.trim().length > 0;
    // Disabled while idle-with-no-text, or always while processing (the
    // button becomes the Stop control while generating).
    this.sendBtn.disabled = this.isGenerating ? false : !hasText;
  }

  /* ── streaming placeholder ────────────────────────────────────────── */

  appendAssistantPlaceholder(model) {
    const el = document.createElement('div');
    el.className = 'msg assistant streaming';
    const main = document.createElement('div');
    main.className = 'msg-main';
    const md = document.createElement('div');
    md.className = 'md';
    md.innerHTML = '<div class="typing" aria-hidden="true"><span></span><span></span><span></span></div>';
    main.appendChild(md);
    el.append(this.avatarEl(), main);
    this.messagesEl.appendChild(el);
    this.scrollToBottom(false);

    let pending = '';
    let raf = 0;

    const paint = () => {
      raf = 0;
      md.innerHTML = renderMarkdown(pending) + '<span class="caret" aria-hidden="true"></span>';
      this.scrollToBottom(false);
    };

    return {
      update: (fullText) => {
        pending = fullText;
        if (!raf) raf = requestAnimationFrame(paint);
      },
      /** Text streamed so far (used to keep partial answers on error). */
      getPartial: () => pending,
      finalize: (content, { stopped } = {}) => {
        if (raf) cancelAnimationFrame(raf);
        el.classList.remove('streaming');
        md.innerHTML = renderMarkdown(content);
        enhanceCodeBlocks(md);
        const toolbar = document.createElement('div');
        toolbar.className = 'msg-toolbar';
        main.appendChild(toolbar);
        if (stopped) {
          const badge = document.createElement('span');
          badge.className = 'stopped-badge';
          badge.textContent = 'Stopped';
          toolbar.appendChild(badge);
        }
        this.refreshToolbars();
        this.scrollToBottom(false);
      },
      remove: () => {
        if (raf) cancelAnimationFrame(raf);
        el.remove();
      },
    };
  }

  /* ── error card ───────────────────────────────────────────────────── */

  showErrorCard(info, conv, model) {
    this.dismissErrorCard();
    const el = document.createElement('div');
    el.className = 'msg assistant error-card';
    el.setAttribute('role', 'alert');
    el.append(this.avatarEl(), (() => {
      const main = document.createElement('div');
      main.className = 'msg-main';
      const title = document.createElement('div');
      title.className = 'error-title';
      title.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-alert"></use></svg>';
      title.appendChild(document.createTextNode(' ' + info.friendly));
      const hint = document.createElement('p');
      hint.className = 'error-hint';
      hint.textContent = info.hint;
      const actions = document.createElement('div');
      actions.className = 'error-actions';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn';
      retry.dataset.action = 'retry';
      retry.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-refresh"></use></svg> Try again';
      actions.appendChild(retry);
      if (info.kind === 'auth') {
        const signin = document.createElement('button');
        signin.type = 'button';
        signin.className = 'btn-primary';
        signin.dataset.action = 'signin';
        signin.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-user"></use></svg> Sign in to Puter';
        actions.appendChild(signin);
      }
      if (info.kind === 'model-unavailable') {
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'btn';
        pick.addEventListener('click', () => { this.modelSelect.focus(); this.dismissErrorCard(); });
        pick.textContent = 'Choose another model';
        actions.appendChild(pick);
      }
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'btn ghost';
      dismiss.dataset.action = 'dismiss-error';
      dismiss.textContent = 'Dismiss';
      actions.appendChild(dismiss);
      main.append(title, hint, actions);
      return main;
    })());
    el.dataset.retryConvId = conv.id;
    el.dataset.retryModel = model;
    this.messagesEl.appendChild(el);
    this.errorCardEl = el;
    this.scrollToBottom(true);
    el.querySelector('[data-action="retry"]')?.focus();
  }

  retryFromErrorCard() {
    const el = this.errorCardEl;
    if (!el) return;
    const conv = store.conversations.find((c) => c.id === el.dataset.retryConvId) || store.active;
    if (!conv) { this.dismissErrorCard(); return; }
    this.dismissErrorCard();
    if (!store.active || store.active.id !== conv.id) store.setActive(conv.id);
    this.generate(conv);
  }

  dismissErrorCard() {
    this.errorCardEl?.remove();
    this.errorCardEl = null;
  }

  /* ── scrolling / a11y helpers ─────────────────────────────────────── */

  scrollToBottom(force) {
    if (force || this.stickToBottom) {
      this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
      this.jumpBtn.hidden = true;
    }
  }

  announce(text) {
    this.srStatus.textContent = text;
  }

  autosize() {
    const ta = this.composer;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }

  focusComposer() {
    this.composer.focus();
  }
}
