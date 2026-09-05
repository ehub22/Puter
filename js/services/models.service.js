/* =========================================================================
 * MODEL REGISTRY — metadata about the models the app can talk to.
 * =========================================================================
 * Two sources, merged:
 *   1. APP_CONFIG.models in js/config.js (curated, always available —
 *      edit that array to change the dropdown and the fallback context
 *      window sizes).
 *   2. puter.ai.listModels() at runtime, which may report `context` and
 *      `max_tokens` for every model Puter currently exposes. Live values
 *      win, so the "tokens left" meter self-corrects when Puter ships new
 *      models or changes a context window.
 * ========================================================================= */

import { APP_CONFIG } from '../config.js';

/** id / alias → live model descriptor from puter.ai.listModels(). */
const liveById = new Map();

/** Store the live catalogue (called once from main.js after the SDK loads). */
export function setLiveModels(list) {
  if (!Array.isArray(list)) return;
  for (const m of list) {
    if (!m || typeof m.id !== 'string') continue;
    liveById.set(m.id, m);
    if (Array.isArray(m.aliases)) {
      for (const alias of m.aliases) {
        if (typeof alias === 'string' && !liveById.has(alias)) liveById.set(alias, m);
      }
    }
  }
}

/** Curated entry for an id (or undefined). */
export function getCuratedModel(id) {
  return APP_CONFIG.models.find((m) => m.id === id);
}

/** Merged metadata: { id, name, provider, context, maxTokens, live }. */
export function getModelMeta(id) {
  const curated = getCuratedModel(id);
  const live = liveById.get(id);
  const context =
    numberOrNull(live?.context) ??
    numberOrNull(live?.context_window) ??
    numberOrNull(curated?.context);
  return {
    id,
    name: curated?.name || live?.name || id,
    provider: curated?.provider || live?.provider || '',
    context,
    maxTokens: numberOrNull(live?.max_tokens) ?? null,
    live: Boolean(live),
  };
}

/**
 * Context-window size (in tokens) used by the composer meter.
 * Falls back to APP_CONFIG.fallbackContextWindow when unknown, and
 * reports whether the number is a real one or just the fallback.
 */
export function getContextWindow(id) {
  const meta = getModelMeta(id);
  if (meta.context && meta.context > 0) return { tokens: meta.context, known: true };
  return { tokens: APP_CONFIG.fallbackContextWindow, known: false };
}

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
