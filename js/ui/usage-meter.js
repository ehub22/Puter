/* =========================================================================
 * USAGE METER — sidebar pill showing what is left on the user's own
 * Puter account this month (credits, and an estimate of tokens).
 * =========================================================================
 * Data comes straight from puter.auth.getMonthlyUsage() via
 * js/services/usage.service.js. It is only shown when the user is signed
 * in, because usage is per-account (the "User-Pays" model).
 * ========================================================================= */

import {
  usageState, subscribeUsage, refreshUsage, formatCredits,
} from '../services/usage.service.js';
import { formatCompact } from '../utils.js';

export class UsageMeter {
  /**
   * @param {Object} deps
   * @param {()=>void} [deps.onOpenDetails] open Settings → AI usage section
   */
  constructor(deps = {}) {
    this.deps = deps;
    this.el = document.getElementById('usage-area');
    this.unsubscribe = subscribeUsage(() => this.render());
  }

  render() {
    const el = this.el;
    if (!el) return;

    /* Signed out → nothing to show (the sign-in chip sits right below). */
    if (!usageState.signedIn) {
      el.hidden = true;
      el.textContent = '';
      return;
    }

    el.hidden = false;
    const { data, loading, error } = usageState;

    el.textContent = '';
    const card = document.createElement('div');
    card.className = 'usage-card';

    const head = document.createElement('div');
    head.className = 'usage-head';

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'usage-label';
    label.innerHTML =
      '<svg class="icon" aria-hidden="true"><use href="#icon-gauge"></use></svg><span></span>';
    label.title = 'Monthly Puter allowance for this app. Click for details.';
    label.addEventListener('click', () => this.deps.onOpenDetails?.());

    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'icon-btn usage-refresh';
    refresh.setAttribute('aria-label', 'Refresh usage');
    refresh.title = 'Refresh usage';
    refresh.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-refresh"></use></svg>';
    refresh.disabled = loading;
    refresh.addEventListener('click', () => refreshUsage({ force: true }));

    head.append(label, refresh);
    card.appendChild(head);

    const textEl = label.querySelector('span');

    if (loading && !data) {
      textEl.textContent = 'Checking usage…';
      card.classList.add('is-loading');
      el.appendChild(card);
      return;
    }

    if (error && !data) {
      textEl.textContent = 'Usage unavailable';
      label.title = error;
      el.appendChild(card);
      return;
    }

    if (!data) {
      textEl.textContent = 'Usage unknown';
      el.appendChild(card);
      return;
    }

    const pct = data.percentRemaining;
    textEl.textContent = data.remaining != null
      ? `${formatCredits(data.remaining)} left`
      : 'Allowance unknown';

    if (pct != null) {
      const bar = document.createElement('div');
      bar.className = 'meter-bar';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', 'Monthly allowance remaining');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', String(Math.round(pct)));
      const fill = document.createElement('span');
      fill.className = 'meter-fill';
      fill.style.width = `${Math.max(2, pct)}%`;
      if (pct <= 10) fill.classList.add('danger');
      else if (pct <= 30) fill.classList.add('warn');
      bar.appendChild(fill);
      card.appendChild(bar);
    }

    const sub = document.createElement('p');
    sub.className = 'usage-sub';
    const parts = [];
    if (pct != null) parts.push(`${Math.round(pct)}% of allowance`);
    if (data.estimatedTokensLeft != null) {
      parts.push(`~${formatCompact(data.estimatedTokensLeft)} tokens left`);
    } else if (data.aiTokens) {
      parts.push(`${formatCompact(data.aiTokens)} tokens used`);
    }
    sub.textContent = parts.join(' · ') || 'No AI usage yet this month';
    card.appendChild(sub);

    el.appendChild(card);
  }
}
