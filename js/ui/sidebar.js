/* =========================================================================
 * SIDEBAR — brand, "New chat" button, grouped conversation history,
 * auth status and the Settings button. Mobile: off-canvas with backdrop.
 * ========================================================================= */

import { store } from '../state.js';
import { confirmDialog, toast } from './toast.js';
import { groupLabel } from '../utils.js';

export class Sidebar {
  /**
   * @param {Object} deps
   * @param {()=>void} deps.onNewChat
   * @param {()=>void} deps.onOpenSettings
   * @param {(id:string)=>void} deps.onSelectConversation
   * @param {()=>Promise<void>} deps.onSignIn
   */
  constructor(deps) {
    this.deps = deps;
    this.el = document.getElementById('sidebar');
    this.listEl = document.getElementById('conv-list');
    this.emptyEl = document.getElementById('conv-empty');
    this.backdrop = document.getElementById('backdrop');

    document.getElementById('new-chat-btn').addEventListener('click', () => {
      this.closeOnMobile();
      deps.onNewChat();
    });
    document.getElementById('settings-btn').addEventListener('click', () => {
      this.closeOnMobile();
      deps.onOpenSettings();
    });
    document.getElementById('sidebar-close').addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', () => this.close());

    this.listEl.addEventListener('click', (e) => this.onListClick(e));
    this.listEl.addEventListener('keydown', (e) => this.onListKeydown(e));
  }

  /* ── mobile off-canvas ────────────────────────────────────────────── */
  open() {
    this.el.classList.add('open');
    this.backdrop.hidden = false;
    document.getElementById('sidebar-close').focus();
  }
  close() {
    this.el.classList.remove('open');
    this.backdrop.hidden = true;
  }
  closeOnMobile() {
    if (window.matchMedia('(max-width: 900px)').matches) this.close();
  }

  /* ── rendering ────────────────────────────────────────────────────── */
  render() {
    const convs = store.conversations;
    this.listEl.textContent = '';
    this.emptyEl.hidden = convs.length > 0;

    let currentLabel = null;
    let currentGroup = null;
    for (const conv of convs) {
      const label = groupLabel(conv.updatedAt || conv.createdAt || Date.now());
      if (label !== currentLabel) {
        currentLabel = label;
        const h = document.createElement('h3');
        h.className = 'conv-group-label';
        h.textContent = label;
        const ul = document.createElement('ul');
        ul.className = 'conv-group';
        ul.setAttribute('role', 'list');
        this.listEl.append(h, ul);
        currentGroup = ul;
      }
      currentGroup.appendChild(this.item(conv));
    }
  }

  item(conv) {
    const li = document.createElement('li');
    li.className = 'conv-item' + (conv.id === store.activeId ? ' active' : '');
    li.dataset.id = conv.id;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'conv-open';
    btn.textContent = conv.title || 'New conversation';
    btn.title = conv.title;
    btn.addEventListener('click', () => {
      this.deps.onSelectConversation(conv.id);
      this.closeOnMobile();
    });

    const actions = document.createElement('div');
    actions.className = 'conv-actions';

    const renameBtn = this.iconButton('icon-pencil', 'Rename conversation');
    renameBtn.addEventListener('click', (e) => { e.stopPropagation(); this.startRename(li, btn, conv); });

    const deleteBtn = this.iconButton('icon-trash', 'Delete conversation');
    deleteBtn.classList.add('danger');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog({
        title: 'Delete conversation?',
        message: `“${conv.title}” and its messages will be permanently removed from this browser.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      store.deleteConversation(conv.id);
      toast('Conversation deleted', { type: 'info' });
    });

    actions.append(renameBtn, deleteBtn);
    li.append(btn, actions);
    return li;
  }

  iconButton(iconId, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn small';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${iconId}"></use></svg>`;
    return b;
  }

  /* ── inline rename ────────────────────────────────────────────────── */
  startRename(li, titleBtn, conv) {
    if (li.querySelector('.rename-input')) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = conv.title;
    input.setAttribute('aria-label', 'Conversation name');
    input.maxLength = 120;
    titleBtn.hidden = true;
    li.prepend(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      store.rename(conv.id, input.value);
      this.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { committed = true; this.render(); }
    });
    input.addEventListener('blur', commit);
    // Don't let row clicks steal focus while editing.
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  /* ── list interaction (Enter on items is handled natively by <button>) ─ */
  onListClick() { /* per-button handlers do the work */ }
  onListKeydown() { /* reserved for future roving tabindex */ }

  /* ── auth chip ────────────────────────────────────────────────────── */
  renderAuth(user) {
    const area = document.getElementById('auth-area');
    area.textContent = '';

    if (user && user.username) {
      const chip = document.createElement('div');
      chip.className = 'auth-chip signed-in';
      chip.innerHTML = `
        <span class="auth-dot" aria-hidden="true"></span>
        <span class="auth-name"></span>
        <button type="button" class="auth-signout" title="Sign out of Puter">Sign out</button>`;
      chip.querySelector('.auth-name').textContent = user.username;
      chip.querySelector('.auth-signout').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Sign out of Puter?',
          message: 'Your conversations stay saved in this browser. You will be asked to sign in again before using AI.',
          confirmLabel: 'Sign out',
        });
        if (!ok) return;
        const { signOut } = await import('../services/puter.service.js');
        const { refreshUsage } = await import('../services/usage.service.js');
        signOut();
        this.renderAuth(null);
        refreshUsage({ force: true }).catch(() => {});  // hides the usage meter
        toast('Signed out of Puter', { type: 'info' });
      });
      area.appendChild(chip);
    } else {
      const chip = document.createElement('div');
      chip.className = 'auth-chip';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn auth-signin';
      btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-user"></use></svg> Sign in to Puter';
      btn.title = 'AI usage is billed to your own Puter account (User-Pays model)';
      btn.addEventListener('click', () => this.deps.onSignIn());
      const note = document.createElement('p');
      note.className = 'auth-note';
      note.textContent = 'AI usage is covered by your own Puter account.';
      chip.append(btn, note);
      area.appendChild(chip);
    }
  }
}
