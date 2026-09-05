/* =========================================================================
 * USAGE SERVICE — "how much is left?" for the signed-in Puter account.
 * =========================================================================
 * Puter bills AI usage to the USER's own account (the "User-Pays" model),
 * so the only authoritative numbers come from Puter itself:
 *
 *     puter.auth.getMonthlyUsage()
 *       → { allowanceInfo: { monthUsageAllowance, remaining },
 *           appTotals:     { [appId]: { count, total } },
 *           usage:         { [apiName]: { cost, count, units } } }
 *
 * Notes from the Puter docs (docs.puter.com/Auth/getMonthlyUsage):
 *   • Values are in MICROCENTS — $0.01 = 1,000,000 microcents,
 *     therefore $1 = 100,000,000 microcents.
 *   • `units` is the raw metered quantity for an API — TOKENS for AI chat
 *     calls, bytes for filesystem calls, and so on.
 *   • The data is scoped to the calling app only, and requires the user to
 *     be signed in. This app only READS it; it never tries to change or
 *     bypass any limit or allowance.
 * ========================================================================= */

import { APP_CONFIG } from '../config.js';
import { isSignedIn } from './puter.service.js';

/** $1 = 100,000,000 microcents ($0.01 = 1,000,000). */
export const MICROCENTS_PER_DOLLAR = 100_000_000;

/** APIs whose `units` are token counts (used for "tokens used" totals). */
const AI_API_RE = /(^|[^a-z])(ai|llm|chat|complete|completion|puterai)([^a-z]|$)/i;

const listeners = new Set();

/** Reactive snapshot other modules render from. */
export const usageState = {
  loading: false,
  error: null,          // human-readable string when the last fetch failed
  data: null,           // normalized usage (see normalize() below)
  fetchedAt: 0,
  signedIn: false,
};

export function subscribeUsage(fn) {
  listeners.add(fn);
  fn(usageState);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(usageState); } catch (err) { console.error('usage listener failed', err); }
  }
}

/**
 * Fetch (or reuse) the monthly usage snapshot.
 * @param {Object} [opts]
 * @param {boolean} [opts.force]     ignore the cache window
 * @param {number}  [opts.maxAgeMs]  cache window (default APP_CONFIG.usageRefreshMs)
 */
export async function refreshUsage({ force = false, maxAgeMs = APP_CONFIG.usageRefreshMs } = {}) {
  const signedIn = isSignedIn();
  usageState.signedIn = signedIn;

  if (!signedIn) {
    usageState.data = null;
    usageState.error = null;
    usageState.loading = false;
    emit();
    return null;
  }

  const fresh = Date.now() - usageState.fetchedAt < maxAgeMs;
  if (!force && fresh && usageState.data) return usageState.data;
  if (usageState.loading) return usageState.data;

  usageState.loading = true;
  usageState.error = null;
  emit();

  try {
    const raw = await window.puter?.auth?.getMonthlyUsage?.();
    usageState.data = normalize(raw);
    usageState.fetchedAt = Date.now();
  } catch (err) {
    console.warn('getMonthlyUsage() failed', err);
    usageState.error = 'Usage data is unavailable right now.';
  } finally {
    usageState.loading = false;
    emit();
  }
  return usageState.data;
}

/** Turn the raw MonthlyUsage object into something the UI can render. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const info = raw.allowanceInfo || {};
  const allowance = num(info.monthUsageAllowance);
  const remaining = num(info.remaining);
  const used = allowance != null && remaining != null
    ? Math.max(0, allowance - remaining)
    : null;
  const percentRemaining = allowance && allowance > 0 && remaining != null
    ? Math.max(0, Math.min(100, (remaining / allowance) * 100))
    : null;

  const byApi = Object.entries(raw.usage || {}).map(([name, v]) => ({
    name,
    cost: num(v?.cost) || 0,
    count: num(v?.count) || 0,
    units: num(v?.units) || 0,
    isAi: AI_API_RE.test(name),
  })).sort((a, b) => b.cost - a.cost);

  const aiRows = byApi.filter((r) => r.isAi);
  const aiTokens = aiRows.reduce((s, r) => s + r.units, 0);
  const aiCost = aiRows.reduce((s, r) => s + r.cost, 0);
  const aiRequests = aiRows.reduce((s, r) => s + r.count, 0);

  return {
    allowance, remaining, used, percentRemaining,
    aiTokens, aiCost, aiRequests,
    totalCost: byApi.reduce((s, r) => s + r.cost, 0),
    byApi,
    /** Tokens the remaining allowance is roughly worth, extrapolated from
     *  this month's own average token price. Null until enough data. */
    estimatedTokensLeft: estimateTokensLeft(remaining, aiCost, aiTokens),
  };
}

/** remaining ÷ (cost per token so far) — an estimate, clearly labelled as
 *  such in the UI, because per-model prices differ wildly. */
function estimateTokensLeft(remaining, aiCost, aiTokens) {
  if (remaining == null || !aiCost || !aiTokens) return null;
  const microcentsPerToken = aiCost / aiTokens;
  if (!Number.isFinite(microcentsPerToken) || microcentsPerToken <= 0) return null;
  return Math.max(0, Math.round(remaining / microcentsPerToken));
}

/** Microcents → "$1.23" / "$0.0042". */
export function formatCredits(microcents) {
  const v = num(microcents);
  if (v == null) return '—';
  const dollars = v / MICROCENTS_PER_DOLLAR;
  if (dollars === 0) return '$0.00';
  if (Math.abs(dollars) < 0.01) return '$' + dollars.toFixed(4);
  if (Math.abs(dollars) < 1) return '$' + dollars.toFixed(3);
  return '$' + dollars.toFixed(2);
}

/** Pretty API name: "ai-chat" / "puterai:complete" → "AI chat". */
export function prettyApiName(name) {
  return String(name)
    .replace(/[_:]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\bai\b/gi, 'AI')
    .replace(/\bfs\b/gi, 'Files')
    .replace(/\bkv\b/gi, 'Key-value')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
