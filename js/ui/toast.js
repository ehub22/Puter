/* Toasts and a Promise-based confirm dialog. */

const TOAST_ICONS = {
  info: 'icon-info',
  success: 'icon-check',
  error: 'icon-alert',
};

/** Show a transient toast. type: 'info' | 'success' | 'error'. */
export function toast(message, { type = 'info', duration = 3600 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', `icon ${TOAST_ICONS[type] || 'icon-info'}`);
  icon.innerHTML = '<use href="#' + (TOAST_ICONS[type] || 'icon-info') + '"></use>';

  const span = document.createElement('span');
  span.textContent = message;

  el.append(icon, span);
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 500); // safety
  }, duration);
}

/** Modal confirmation. Resolves true (confirmed) / false (cancelled).
 *  `danger` styles the confirm button red and defaults focus to Cancel. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h2 id="confirm-title"></h2>
        <p id="confirm-message"></p>
        <div class="modal-actions">
          <button type="button" class="btn" data-confirm-cancel></button>
          <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok></button>
        </div>
      </div>`;
    overlay.querySelector('#confirm-title').textContent = title;
    overlay.querySelector('#confirm-message').textContent = message;
    const cancelBtn = overlay.querySelector('[data-confirm-cancel]');
    const okBtn = overlay.querySelector('[data-confirm-ok]');
    cancelBtn.textContent = cancelLabel;
    okBtn.textContent = confirmLabel;

    const previouslyFocused = document.activeElement;
    let done = false;
    const close = (result) => {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus?.();
      resolve(result);
    };
    const isTopmost = () => {
      const overlays = document.querySelectorAll('.modal-overlay');
      return overlays[overlays.length - 1] === overlay;
    };
    const onKey = (e) => {
      if (!isTopmost()) return; // let a dialog stacked above handle it
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
      if (e.key === 'Tab') { // tiny focus trap between the two buttons
        e.preventDefault();
        (document.activeElement === cancelBtn ? okBtn : cancelBtn).focus();
      }
    };

    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey, true);

    root.appendChild(overlay);
    (danger ? cancelBtn : okBtn).focus();
  });
}
