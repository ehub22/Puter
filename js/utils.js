/* Small shared helpers. */

/** Unique conversation/message id. */
export function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Classic trailing-edge debounce. */
export function debounce(fn, ms = 250) {
  let t = null;
  const debounced = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  debounced.flush = (...args) => { clearTimeout(t); fn(...args); };
  debounced.cancel = () => clearTimeout(t);
  return debounced;
}

/** Escape a string for safe injection into HTML (used as a fallback when
 *  the Markdown libraries have not loaded). */
export function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Collapse whitespace and truncate with an ellipsis — used for
 *  auto-generating conversation titles from the first user message. */
export function truncateTitle(text, max = 48) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return 'New conversation';
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean;
}

/** Sidebar date-group label for a timestamp. */
export function groupLabel(ts) {
  const now = new Date();
  const d = new Date(ts);
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  if (days < 30) return 'Previous 30 days';
  return 'Older';
}

/** "14:32" style clock for message tooltips. */
export function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Approximate localStorage payload size in KB. */
export function approxKb(str) {
  return Math.max(1, Math.round((new Blob([str]).size) / 1024));
}

/* ── Token estimation ──────────────────────────────────────────────────
 * Puter.js does not expose a tokenizer, so the context meter uses the
 * usual ~4-characters-per-token heuristic (with a small correction for
 * whitespace-heavy text such as code). It is an ESTIMATE — always shown
 * with a “~” in the UI — and is only used for the local context gauge,
 * never for billing. Real token accounting comes from
 * puter.auth.getMonthlyUsage() (see js/services/usage.service.js).
 * ──────────────────────────────────────────────────────────────────── */

/** Rough token count for a piece of text. */
export function estimateTokens(text) {
  const s = String(text || '');
  if (!s) return 0;
  const words = (s.match(/\S+/g) || []).length;
  // Average of two cheap heuristics: chars/4 and words*1.33.
  return Math.max(1, Math.round((s.length / 4 + words * 1.33) / 2));
}

/** Rough token count for an array of {role, content} chat messages.
 *  Adds the usual per-message envelope overhead (~4 tokens) plus a few
 *  tokens for the reply priming, mirroring OpenAI's counting guidance. */
export function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 3;
  for (const m of messages) total += estimateTokens(m?.content) + 4;
  return total;
}

/** 1234 → "1,234"; 128000 → "128k"; 1200000 → "1.2M". */
export function formatCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) < 1000) return String(Math.round(v));
  if (Math.abs(v) < 1_000_000) {
    const k = v / 1000;
    return (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
  }
  const m = v / 1_000_000;
  return (m >= 100 ? Math.round(m) : Math.round(m * 10) / 10) + 'M';
}

/** 1234567 → "1,234,567" */
export function formatNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString();
}
