/* =========================================================================
 * SETTINGS DIALOG — theme, streaming, system prompt, temperature,
 * max tokens, data management. Changes apply & persist immediately.
 * ========================================================================= */

import { store } from '../state.js';
import * as storage from '../services/storage.service.js';
import {
  usageState, subscribeUsage, refreshUsage, formatCredits, prettyApiName,
} from '../services/usage.service.js';
import { formatCompact, formatNumber } from '../utils.js';
import { confirmDialog, toast } from './toast.js';

export class SettingsModal {
  /**
   * @param {Object} deps
   * @param {()=>void} deps.onClose         called after the dialog closes
   * @param {()=>void} deps.onClearedAll    called after all conversations are wiped
   */
  constructor(deps = {}) {
    this.deps = deps;
    this.overlay = null;
  }

  /**
   * @param {Object} [opts]
   * @param {'usage'} [opts.focus] scroll straight to a section
   */
  open(opts = {}) {
    if (this.overlay) {
      if (opts.focus === 'usage') this.scrollToUsage();
      return;
    }
    const s = store.settings;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button type="button" class="icon-btn" data-close aria-label="Close settings">
            <svg class="icon" aria-hidden="true"><use href="#icon-x"></use></svg>
          </button>
        </header>

        <div class="modal-body">
          <section class="setting-row">
            <div class="setting-label">
              <label id="theme-label">Theme</label>
              <p class="setting-desc">Light, dark, or follow your system.</p>
            </div>
            <div class="segmented" role="radiogroup" aria-labelledby="theme-label">
              ${['light', 'dark', 'system'].map((t) => `
                <button type="button" role="radio" aria-checked="${s.theme === t}" data-theme="${t}">
                  <svg class="icon" aria-hidden="true"><use href="#icon-${t === 'system' ? 'monitor' : t === 'dark' ? 'moon' : 'sun'}"></use></svg>
                  ${t[0].toUpperCase() + t.slice(1)}
                </button>`).join('')}
            </div>
          </section>

          <section class="setting-row">
            <div class="setting-label">
              <label for="setting-streaming">Stream responses</label>
              <p class="setting-desc">Show replies as they are generated. Turn off for slower connections.</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="setting-streaming" ${s.streaming ? 'checked' : ''}>
              <span class="switch-track" aria-hidden="true"></span>
            </label>
          </section>

          <section class="setting-col">
            <label for="setting-system-prompt">System prompt <span class="optional">(optional)</span></label>
            <p class="setting-desc">Prepended to every request, e.g. “You are a concise assistant.”</p>
            <textarea id="setting-system-prompt" rows="3" maxlength="2000"
              placeholder="e.g. You are a helpful assistant. Keep answers short."></textarea>
          </section>

          <div class="setting-grid">
            <section class="setting-col">
              <label for="setting-temperature">Temperature <span class="optional">(0–2)</span></label>
              <p class="setting-desc">Higher = more creative. Empty = model default.</p>
              <input type="number" id="setting-temperature" min="0" max="2" step="0.1"
                placeholder="Model default" inputmode="decimal">
            </section>
            <section class="setting-col">
              <label for="setting-max-tokens">Max tokens</label>
              <p class="setting-desc">Cap on reply length. Empty = model default.</p>
              <input type="number" id="setting-max-tokens" min="1" step="1"
                placeholder="Model default" inputmode="numeric">
            </section>
          </div>

          <section class="setting-col usage-panel-section" data-usage-section>
            <h3>AI usage this month</h3>
            <p class="setting-desc">
              Live numbers from your own Puter account
              (<code>puter.auth.getMonthlyUsage()</code>), scoped to this app.
              Puter bills AI usage to the signed-in user, so this is your
              remaining allowance — not the developer's.
            </p>
            <div data-usage-panel class="usage-panel"></div>
            <div class="usage-panel-actions">
              <button type="button" class="btn" data-usage-refresh>
                <svg class="icon" aria-hidden="true"><use href="#icon-refresh"></use></svg>
                Refresh usage
              </button>
              <a class="btn ghost" href="https://puter.com/dashboard#usage" target="_blank" rel="noopener">
                Open Puter dashboard
              </a>
            </div>
          </section>

          <section class="setting-col danger-zone">
            <h3>Stored data</h3>
            <p class="setting-desc">
              <span data-storage-size></span> of conversations stored locally in this browser.
              Nothing is uploaded anywhere else by this app.
            </p>
            <button type="button" class="btn-danger" data-clear-all>Clear all stored conversations…</button>
          </section>
        </div>

        <footer class="modal-foot">
          <button type="button" class="btn-primary" data-close>Done</button>
        </footer>
      </div>`;

    this.overlay = overlay;
    const modal = overlay.querySelector('.modal');

    /* wire close */
    const close = () => {
      overlay.remove();
      this.overlay = null;
      this.unsubscribeUsage?.();
      this.unsubscribeUsage = null;
      document.removeEventListener('keydown', onKey, true);
      this.deps.onClose?.();
    };
    const isTopmost = () => {
      const overlays = document.querySelectorAll('.modal-overlay');
      return overlays[overlays.length - 1] === overlay;
    };
    const onKey = (e) => {
      if (!isTopmost()) return; // a confirm dialog may be stacked on top
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') this.trapFocus(modal, e);
    };
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);

    /* theme segmented control */
    overlay.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.updateSettings({ theme: btn.dataset.theme });
        overlay.querySelectorAll('[data-theme]').forEach((b) =>
          b.setAttribute('aria-checked', String(b === btn)));
        applyTheme(store.settings.theme);
      });
    });

    /* streaming */
    overlay.querySelector('#setting-streaming').addEventListener('change', (e) => {
      store.updateSettings({ streaming: e.target.checked });
    });

    /* system prompt */
    const sysEl = overlay.querySelector('#setting-system-prompt');
    sysEl.value = s.systemPrompt || '';
    sysEl.addEventListener('change', () => store.updateSettings({ systemPrompt: sysEl.value }));

    /* temperature / max tokens */
    const tempEl = overlay.querySelector('#setting-temperature');
    const tokEl = overlay.querySelector('#setting-max-tokens');
    if (s.temperature != null) tempEl.value = s.temperature;
    if (s.maxTokens != null) tokEl.value = s.maxTokens;
    tempEl.addEventListener('change', () => {
      const v = tempEl.value === '' ? null : Number(tempEl.value);
      if (v != null && (!Number.isFinite(v) || v < 0 || v > 2)) {
        toast('Temperature must be between 0 and 2', { type: 'error' });
        tempEl.value = s.temperature ?? '';
        return;
      }
      store.updateSettings({ temperature: v });
    });
    tokEl.addEventListener('change', () => {
      const v = tokEl.value === '' ? null : Math.floor(Number(tokEl.value));
      if (v != null && (!Number.isFinite(v) || v < 1)) {
        toast('Max tokens must be a positive number', { type: 'error' });
        tokEl.value = s.maxTokens ?? '';
        return;
      }
      store.updateSettings({ maxTokens: v });
    });

    /* data */
    overlay.querySelector('[data-storage-size]').textContent = `${storage.storedSizeKb()} KB`;
    overlay.querySelector('[data-clear-all]').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Clear all conversations?',
        message: 'Every conversation stored in this browser will be permanently deleted. This cannot be undone.',
        confirmLabel: 'Clear everything',
        danger: true,
      });
      if (!ok) return;
      store.deleteAll();
      overlay.querySelector('[data-storage-size]').textContent = '0 KB';
      toast('All stored conversations cleared', { type: 'success' });
      this.deps.onClearedAll?.();
    });

    /* AI usage panel — re-renders whenever the usage service updates. */
    const panel = overlay.querySelector('[data-usage-panel]');
    this.unsubscribeUsage = subscribeUsage(() => renderUsagePanel(panel));
    overlay.querySelector('[data-usage-refresh]').addEventListener('click', (e) => {
      e.currentTarget.disabled = true;
      refreshUsage({ force: true }).finally(() => {
        if (this.overlay) e.currentTarget.disabled = false;
      });
    });
    refreshUsage();

    document.getElementById('modal-root').appendChild(overlay);
    modal.querySelector('[data-close]').focus();
    if (opts.focus === 'usage') this.scrollToUsage();
  }

  scrollToUsage() {
    const section = this.overlay?.querySelector('[data-usage-section]');
    if (!section) return;
    requestAnimationFrame(() => {
      section.scrollIntoView({ block: 'center', behavior: 'smooth' });
      section.classList.add('flash');
      setTimeout(() => section.classList.remove('flash'), 1200);
    });
  }

  trapFocus(modal, e) {
    const focusables = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/* ── AI usage panel ───────────────────────────────────────────────────── */

/** Render the current usageState snapshot into the settings panel. */
function renderUsagePanel(el) {
  if (!el) return;
  el.textContent = '';
  const { data, loading, error, signedIn } = usageState;

  if (!signedIn) {
    el.appendChild(note('Sign in to Puter to see how much of your monthly allowance is left.'));
    return;
  }
  if (loading && !data) {
    el.appendChild(note('Loading usage…'));
    return;
  }
  if (error && !data) {
    el.appendChild(note(error));
    return;
  }
  if (!data) {
    el.appendChild(note('No usage data available for this app yet.'));
    return;
  }

  /* Headline: remaining allowance + progress bar. */
  const head = document.createElement('div');
  head.className = 'usage-headline';
  const big = document.createElement('strong');
  big.textContent = data.remaining != null ? formatCredits(data.remaining) : '—';
  const small = document.createElement('span');
  small.textContent = data.allowance != null
    ? ` left of ${formatCredits(data.allowance)} this month`
    : ' remaining';
  head.append(big, small);
  el.appendChild(head);

  if (data.percentRemaining != null) {
    const bar = document.createElement('div');
    bar.className = 'meter-bar lg';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Monthly allowance remaining');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(Math.round(data.percentRemaining)));
    const fill = document.createElement('span');
    fill.className = 'meter-fill';
    fill.style.width = `${Math.max(2, data.percentRemaining)}%`;
    if (data.percentRemaining <= 10) fill.classList.add('danger');
    else if (data.percentRemaining <= 30) fill.classList.add('warn');
    bar.appendChild(fill);
    el.appendChild(bar);
  }

  /* Key numbers. */
  const stats = document.createElement('dl');
  stats.className = 'usage-stats';
  const rows = [
    ['Tokens used (AI)', data.aiTokens ? formatNumber(data.aiTokens) : '0'],
    ['Est. tokens left', data.estimatedTokensLeft != null
      ? '~' + formatNumber(data.estimatedTokensLeft) : 'n/a'],
    ['AI requests', formatNumber(data.aiRequests || 0)],
    ['Spent this month', formatCredits(data.used ?? data.totalCost)],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    stats.append(dt, dd);
  }
  el.appendChild(stats);

  /* Per-API breakdown. */
  if (data.byApi.length) {
    const table = document.createElement('table');
    table.className = 'usage-table';
    table.innerHTML =
      '<thead><tr><th scope="col">API</th><th scope="col">Calls</th>' +
      '<th scope="col">Units</th><th scope="col">Cost</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const row of data.byApi.slice(0, 8)) {
      const tr = document.createElement('tr');
      const cells = [
        prettyApiName(row.name),
        formatNumber(row.count),
        row.units ? formatCompact(row.units) : '—',
        formatCredits(row.cost),
      ];
      cells.forEach((c, i) => {
        const td = document.createElement('td');
        td.textContent = c;
        if (i > 0) td.className = 'num';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    el.appendChild(table);
  }

  el.appendChild(note(
    'Units are tokens for AI calls and bytes for storage calls. ' +
    '"Est. tokens left" extrapolates your remaining allowance from this ' +
    "month's average token price, so it moves with the models you pick."
  ));
}

function note(text) {
  const p = document.createElement('p');
  p.className = 'usage-note';
  p.textContent = text;
  return p;
}

/** Apply 'light' | 'dark' | 'system' to <html data-theme>. Exported here so
 *  main.js and the inline boot script can share the logic. */
export function applyTheme(theme) {
  const dark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
