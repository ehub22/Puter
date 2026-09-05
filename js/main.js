/* =========================================================================
 * MAIN — application bootstrap and wiring between components.
 * =========================================================================
 * Component map:
 *   config.js                 → app & model configuration (edit models here)
 *   state.js                  → conversation store (persisted to localStorage)
 *   services/puter.service.js → ALL Puter.js API access (auth, chat, models)
 *   services/storage.service.js → localStorage persistence
 *   services/markdown.service.js → sanitized Markdown rendering
 *   ui/sidebar.js             → conversations list, new chat, settings button
 *   ui/chat-view.js           → messages, streaming, composer, header
 *   ui/settings-modal.js      → settings dialog
 *   ui/toast.js               → toasts + confirm dialogs
 * ========================================================================= */

import { APP_CONFIG } from './config.js';
import { store, flushPersistence } from './state.js';
import * as puterSvc from './services/puter.service.js';
import { Sidebar } from './ui/sidebar.js';
import { ChatView } from './ui/chat-view.js';
import { SettingsModal, applyTheme } from './ui/settings-modal.js';
import { toast } from './ui/toast.js';

async function refreshAuth(sidebar) {
  try {
    if (puterSvc.isSignedIn()) {
      const user = await puterSvc.getUser();
      sidebar.renderAuth(user && user.username ? user : { username: 'Signed in' });
    } else {
      sidebar.renderAuth(null);
    }
  } catch {
    sidebar.renderAuth(null);
  }
}

function showSdkBanner(message) {
  const el = document.createElement('div');
  el.className = 'sdk-banner';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <svg class="icon" aria-hidden="true"><use href="#icon-alert"></use></svg>
    <div class="sdk-banner-text">
      <strong>Puter.js could not be loaded.</strong>
      <span></span>
    </div>
    <button type="button" class="btn">Reload</button>`;
  el.querySelector('span').textContent = ' ' + message;
  el.querySelector('button').addEventListener('click', () => location.reload());
  document.getElementById('messages').prepend(el);
}

async function main() {
  document.title = `${APP_CONFIG.appName} — AI chat powered by Puter.js`;

  /* 1. Hydrate persisted state and apply the saved theme immediately. */
  store.hydrate();
  applyTheme(store.settings.theme);

  /* 2. Official Puter sign-in flow (popup managed entirely by Puter). */
  const signInFlow = async () => {
    try {
      await puterSvc.signIn();
      toast('Signed in to Puter', { type: 'success' });
      await refreshAuth(sidebar);
    } catch (err) {
      console.warn('Sign-in failed or cancelled:', err);
      toast('Sign-in was cancelled or failed', { type: 'error' });
    }
  };

  /* 3. Build the components. */
  const sidebar = new Sidebar({
    onNewChat: () => chatView.openDraft(),
    onOpenSettings: () => settingsModal.open(),
    onSelectConversation: (id) => store.setActive(id),
    onSignIn: signInFlow,
  });

  const chatView = new ChatView({
    onToggleSidebar: () =>
      sidebar.el.classList.contains('open') ? sidebar.close() : sidebar.open(),
    onSignIn: signInFlow,
  });

  const settingsModal = new SettingsModal({
    onClose: () => chatView.focusComposer(),
    onClearedAll: () => chatView.openConversation(null),
  });

  /* 4. Store → sidebar sync + initial render. */
  store.subscribe(() => sidebar.render());
  sidebar.render();
  chatView.openConversation(store.active);

  /* 5. Wait for the Puter.js SDK, then fetch the live model catalog and
     the auth status. The app still works as a history viewer if the SDK
     cannot be reached (e.g. offline). */
  try {
    await puterSvc.waitForSDK();
  } catch (err) {
    showSdkBanner(err.message);
    return;
  }

  puterSvc.listModels().then((live) => chatView.mergeLiveModels(live));
  await refreshAuth(sidebar);

  /* 6. Shortcuts and persistence guards. */
  window.addEventListener('beforeunload', flushPersistence);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPersistence();
      refreshAuth(sidebar); // pick up sign-ins done in the Puter popup
    }
  });

  // Follow OS theme changes while in "System" mode.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.settings.theme === 'system') applyTheme('system');
  });

  // Keyboard shortcut: Ctrl/Cmd+K → new chat.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      chatView.openDraft();
      sidebar.closeOnMobile();
    }
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  document.body.insertAdjacentHTML('beforeend',
    '<div class="sdk-banner" role="alert"><strong>Something went wrong while starting the app.</strong></div>');
});
