// Read-only note markdown for previews (cards, side card, probe callout). Notes are local, but
// they still pass through DOMPurify so nothing in a note can run script in the webview.
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { isTauri, invoke } from '@tauri-apps/api/core';

export const renderMarkdown = markdown => DOMPurify.sanitize(marked.parse(markdown ?? '', { async: false, gfm: true }));

// A link must never navigate the app's own window; it opens in the browser or mail app.
export function openLink(href) {
  if (!/^(https?:|mailto:)/i.test(href ?? '')) return;
  if (isTauri()) invoke('open_link', { url: href }).catch(() => {});
  else window.open(href, '_blank', 'noopener');
}
document.addEventListener('click', event => {
  const anchor = event.target.closest?.('.markdown a[href]');
  if (!anchor) return;
  event.preventDefault();
  // In the editor a plain click places the cursor; Cmd/Ctrl-click follows the link.
  if (anchor.closest('.ProseMirror') && !(event.metaKey || event.ctrlKey)) return;
  openLink(anchor.getAttribute('href'));
});
