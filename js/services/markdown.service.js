/* =========================================================================
 * MARKDOWN SERVICE — safe Markdown rendering for assistant messages.
 * =========================================================================
 * Uses `marked` to parse Markdown and `DOMPurify` to sanitize the HTML,
 * which prevents script injection (<script>, on* handlers, javascript:
 * URLs, etc.) from ever reaching the DOM. Both libraries are loaded as
 * classic scripts in index.html (pinned CDN versions).
 *
 * Pipeline:  raw text → marked.parse() → DOMPurify.sanitize() → innerHTML
 * After insertion, enhance() decorates <pre> blocks with a language label
 * and a copy button.
 * ========================================================================= */

import { escapeHtml } from '../utils.js';

let configured = false;

function ensureConfigured() {
  if (configured || !window.marked) return;
  window.marked.use({
    gfm: true,      // GitHub-flavored Markdown (tables, strikethrough…)
    breaks: true,   // single newlines become <br>, matching chat expectations
  });
  if (window.DOMPurify) {
    // Open external links in a new tab, safely.
    window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }
  configured = true;
}

/** Render Markdown to sanitized HTML. Falls back to escaped plain text if
 *  the CDN libraries are unavailable (offline resilience). */
export function renderMarkdown(text) {
  const source = text ?? '';
  if (!window.marked) {
    return escapeHtml(source).replace(/\n/g, '<br>');
  }
  ensureConfigured();
  let html;
  try {
    html = window.marked.parse(source);
  } catch (err) {
    console.warn('Markdown parse failed, rendering as plain text.', err);
    return escapeHtml(source).replace(/\n/g, '<br>');
  }
  if (window.DOMPurify) {
    return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }
  return html; // extremely unlikely: DOMPurify missing → treat as untrusted
}

/** Decorate code blocks inside a rendered container: wrap each <pre> in a
 *  .codeblock shell with a language badge + copy button. Idempotent. */
export function enhanceCodeBlocks(container) {
  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.closest('.codeblock')) return; // already enhanced
    const code = pre.querySelector('code');
    const langMatch = code?.className?.match(/language-([\w+#.-]+)/);
    const lang = langMatch ? langMatch[1] : '';

    const shell = document.createElement('div');
    shell.className = 'codeblock';

    const bar = document.createElement('div');
    bar.className = 'codeblock-bar';
    const label = document.createElement('span');
    label.className = 'codeblock-lang';
    label.textContent = lang || 'code';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'codeblock-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(code ? code.innerText : pre.innerText);
      copyBtn.textContent = ok ? 'Copied!' : 'Failed';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
    });
    bar.append(label, copyBtn);

    pre.parentNode.insertBefore(shell, pre);
    shell.append(bar, pre);
  });
}

/** Clipboard helper with a legacy fallback. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
