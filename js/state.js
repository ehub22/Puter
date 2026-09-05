/* =========================================================================
 * STATE — in-memory conversation store, persisted via storage.service.js.
 * =========================================================================
 * Conversation shape (per the project spec):
 *   {
 *     id, title, model,
 *     messages: [{ role: 'user'|'assistant', content, timestamp }],
 *     createdAt, updatedAt
 *   }
 * `activeId === null` means "draft": the composer is focused on a
 * conversation that does not exist yet — it is created on first send.
 * ========================================================================= */

import { APP_CONFIG } from './config.js';
import * as storage from './services/storage.service.js';
import { uid, truncateTitle } from './utils.js';

class Store {
  constructor() {
    this.conversations = [];   // sorted by updatedAt, newest first
    this.activeId = null;
    this.settings = { ...APP_CONFIG.defaultSettings };
    this.listeners = new Set();
  }

  /* ── subscription ─────────────────────────────────────────────────── */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  /* ── hydration ────────────────────────────────────────────────────── */
  hydrate() {
    this.conversations = storage.loadConversations();
    this.conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    this.settings = storage.loadSettings();
    const savedActive = storage.loadActiveId();
    this.activeId = this.conversations.some((c) => c.id === savedActive) ? savedActive : null;
  }

  get active() {
    return this.conversations.find((c) => c.id === this.activeId) ?? null;
  }

  /* ── conversations ────────────────────────────────────────────────── */
  createConversation({ model } = {}) {
    const now = Date.now();
    const conv = {
      id: uid(),
      title: 'New conversation',
      model: model || this.settings.lastModel || APP_CONFIG.defaultModel,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.unshift(conv);
    this.activeId = conv.id;
    this._persist();
    this.emit();
    return conv;
  }

  setActive(id) {
    this.activeId = id;
    storage.saveActiveId(id);
    this.emit();
  }

  rename(id, title) {
    const conv = this.conversations.find((c) => c.id === id);
    if (!conv) return;
    const clean = String(title).replace(/\s+/g, ' ').trim();
    conv.title = clean || 'New conversation';
    this._persist();
    this.emit();
  }

  deleteConversation(id) {
    this.conversations = this.conversations.filter((c) => c.id !== id);
    if (this.activeId === id) {
      this.activeId = null;
      storage.saveActiveId(null);
    }
    this._persist();
    this.emit();
  }

  deleteAll() {
    this.conversations = [];
    this.activeId = null;
    storage.clearAllConversations();
    storage.saveActiveId(null);
    this.emit();
  }

  clearMessages(id) {
    const conv = this.conversations.find((c) => c.id === id);
    if (!conv) return;
    conv.messages = [];
    this._touch(conv);
  }

  setConversationModel(id, model) {
    const conv = this.conversations.find((c) => c.id === id);
    if (!conv) return;
    conv.model = model;
    this.settings.lastModel = model;
    this._persist();
    storage.saveSettings(this.settings);
    this.emit();
  }

  /* ── messages ─────────────────────────────────────────────────────── */

  /** Append a message. The first user message also auto-titles the chat. */
  addMessage(conv, role, content) {
    const msg = { role, content, timestamp: Date.now() };
    conv.messages.push(msg);
    if (role === 'user' && conv.title === 'New conversation') {
      conv.title = truncateTitle(content);
    }
    this._touch(conv);
    return msg;
  }

  /** Replace the content of the trailing assistant message (streaming). */
  updateLastAssistant(conv, content) {
    const last = conv.messages[conv.messages.length - 1];
    if (last && last.role === 'assistant') {
      last.content = content;
      // No full re-sort/persist per chunk; persistence happens on finalize.
    }
  }

  /** Remove trailing assistant messages (used by Regenerate). Returns the
   *  index of the last remaining user message, or -1. */
  popTrailingAssistants(conv) {
    while (conv.messages.length && conv.messages[conv.messages.length - 1].role === 'assistant') {
      conv.messages.pop();
    }
    this._touch(conv);
    return conv.messages.length - 1;
  }

  /* ── settings ─────────────────────────────────────────────────────── */
  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    storage.saveSettings(this.settings);
    this.emit();
  }

  /* ── internals ────────────────────────────────────────────────────── */
  _touch(conv) {
    conv.updatedAt = Date.now();
    this.conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    this._persist();
    this.emit();
  }

  _persist() {
    storage.saveConversations(this.conversations);
  }
}

export const store = new Store();

/** Flush pending writes (called on page unload). */
export function flushPersistence() {
  storage.saveConversationsNow(store.conversations);
}

/* ── Building the request sent to Puter ──────────────────────────────── */

/** Full relevant history for a request:
 *  optional system prompt + conversation messages (user/assistant only),
 *  capped at APP_CONFIG.maxContextMessages to keep token usage reasonable. */
export function buildApiMessages(conv, settings) {
  const messages = [];
  const sys = (settings.systemPrompt || '').trim();
  if (sys) messages.push({ role: 'system', content: sys });

  const history = conv.messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => ({ role: m.role, content: m.content }));

  const capped = history.slice(-APP_CONFIG.maxContextMessages);
  // Most providers expect the first non-system message to be from the user.
  while (capped.length && capped[0].role !== 'user') capped.shift();
  return messages.concat(capped);
}
