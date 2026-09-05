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
