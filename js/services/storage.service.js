/* =========================================================================
 * STORAGE SERVICE — localStorage persistence for conversations & settings.
 * =========================================================================
 * Conversations are stored under APP_CONFIG.storageKeys.conversations as a
 * JSON array of conversation objects:
 *
 *   {
 *     id: "unique-conversation-id",
 *     title: "New conversation",
 *     model: "selected-model",
 *     messages: [{ role, content, timestamp }],
 *     createdAt: 1234567890,
 *     updatedAt: 1234567890
 *   }
 *
 * All timestamps are Unix epoch milliseconds (Date.now()).
 * Writes are debounced to avoid hammering localStorage while streaming.
 * ========================================================================= */

import { APP_CONFIG } from '../config.js';
import { debounce } from '../utils.js';

const { storageKeys: KEYS } = APP_CONFIG;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn(`storage.read failed for ${key}`, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    // QuotaExceededError or private-mode restrictions — never crash the app.
    console.warn(`storage.write failed for ${key}`, err);
    return false;
  }
}

/* ── Conversations ───────────────────────────────────────────────────── */

export function loadConversations() {
  const list = readJSON(KEYS.conversations, []);
  if (!Array.isArray(list)) return [];
  // Minimal shape validation so corrupted entries can't crash the UI.
  return list.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages));
}

const persistConversations = debounce((list) => {
  writeJSON(KEYS.conversations, list);
}, 300);

export function saveConversations(list) {
  persistConversations(list);
}

/** Force an immediate write (used before unload). */
export function saveConversationsNow(list) {
  persistConversations.cancel();
  writeJSON(KEYS.conversations, list);
}

/* ── Settings ────────────────────────────────────────────────────────── */

export function loadSettings() {
  return { ...APP_CONFIG.defaultSettings, ...readJSON(KEYS.settings, {}) };
}

export function saveSettings(settings) {
  writeJSON(KEYS.settings, settings);
}

/* ── Active conversation id ──────────────────────────────────────────── */

export function loadActiveId() {
  try { return localStorage.getItem(KEYS.active); } catch { return null; }
}

export function saveActiveId(id) {
  try { id ? localStorage.setItem(KEYS.active, id) : localStorage.removeItem(KEYS.active); } catch { /* ignore */ }
}

/* ── Maintenance ─────────────────────────────────────────────────────── */

export function clearAllConversations() {
  try {
    localStorage.removeItem(KEYS.conversations);
    localStorage.removeItem(KEYS.active);
  } catch { /* ignore */ }
}

/** Size of stored conversations, in KB (for the Settings dialog). */
export function storedSizeKb() {
  try {
    const raw = localStorage.getItem(KEYS.conversations) || '';
    return Math.max(raw ? 1 : 0, Math.round(raw.length / 1024));
  } catch { return 0; }
}
