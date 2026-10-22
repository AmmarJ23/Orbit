// One note body, two ways to edit it: Markdown (raw text) and Rich (document-style, no markup
// shown). Markdown is the stored form. Rich only writes markdown back after an edit there, so
// opening a note in Rich never rewrites it.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';

const $ = id => document.getElementById(id);
const formats = {
  bold: editor => editor.chain().focus().toggleBold().run(),
  italic: editor => editor.chain().focus().toggleItalic().run(),
  strike: editor => editor.chain().focus().toggleStrike().run(),
  code: editor => editor.chain().focus().toggleCode().run(),
  heading: editor => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  bulletList: editor => editor.chain().focus().toggleBulletList().run(),
  orderedList: editor => editor.chain().focus().toggleOrderedList().run(),
};
const active = { bold: 'bold', italic: 'italic', strike: 'strike', code: 'code', heading: ['heading', { level: 2 }], bulletList: 'bulletList', orderedList: 'orderedList', link: 'link' };

export function createNoteEditor({ onInput }) {
  const rich = $('note-rich'), raw = $('note-raw'), toolbar = $('note-format'), linkField = $('note-format-link');
  let source = '';
  let mode = 'rich';
  // setContent with emitUpdate off should stay silent; this also covers any stray update.
  let loading = false;
  const editor = new Editor({
    element: rich,
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true, linkOnPaste: true } }), Markdown],
    content: '',
    contentType: 'markdown',
    onUpdate() {
      rich.classList.toggle('empty', editor.isEmpty);
      if (loading) return;
      source = editor.getMarkdown();
      onInput(source);
    },
    onSelectionUpdate: placeToolbar,
    onBlur({ event }) { if (!toolbar.contains(event?.relatedTarget)) toolbar.hidden = true; },
  });
  raw.addEventListener('input', () => { source = raw.value; onInput(source); });

  // The format bar floats over a non-empty selection, the way document editors do.
  function placeToolbar() {
    const { from, to, empty } = editor.state.selection;
    if (empty || mode !== 'rich' || !editor.isFocused) { if (!toolbar.contains(document.activeElement)) toolbar.hidden = true; return; }
    for (const button of toolbar.querySelectorAll('[data-format]')) {
      const [name, attributes] = [].concat(active[button.dataset.format]);
      button.setAttribute('aria-pressed', String(editor.isActive(name, attributes)));
    }
    linkField.hidden = true;
    toolbar.hidden = false;
    const box = rich.parentElement.getBoundingClientRect();
    const start = editor.view.coordsAtPos(from), end = editor.view.coordsAtPos(to);
    const left = Math.max(0, Math.min((start.left + end.left) / 2 - box.left - toolbar.offsetWidth / 2, box.width - toolbar.offsetWidth));
    toolbar.style.left = left + 'px';
    // Above the selection, or below it on the first line so it never covers the text.
    const scroll = rich.parentElement.scrollTop;
    const above = start.top - box.top + scroll - toolbar.offsetHeight - 8;
    toolbar.style.top = (above >= scroll ? above : end.bottom - box.top + scroll + 8) + 'px';
  }
  toolbar.addEventListener('mousedown', event => { if (event.target !== linkField.querySelector('input')) event.preventDefault(); });
  toolbar.addEventListener('click', event => {
    const format = event.target.closest('[data-format]')?.dataset.format;
    if (!format) return;
    if (format !== 'link') { formats[format](editor); placeToolbar(); return; }
    linkField.hidden = false;
    const input = linkField.querySelector('input');
    input.value = editor.getAttributes('link').href ?? '';
    input.focus();
  });
  linkField.querySelector('input').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); linkField.hidden = true; editor.commands.focus(); }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const href = event.target.value.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    (href ? chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : 'https://' + href }) : chain.unsetLink()).run();
    linkField.hidden = true;
  });

  function showMode() {
    rich.hidden = mode !== 'rich';
    raw.hidden = mode !== 'markdown';
    toolbar.hidden = true;
  }
  function fill() {
    loading = true;
    editor.commands.setContent(source, { contentType: 'markdown', emitUpdate: false });
    loading = false;
    rich.classList.toggle('empty', editor.isEmpty);
  }
  return {
    load(markdown) { source = markdown; raw.value = markdown; fill(); },
    get markdown() { return source; },
    get mode() { return mode; },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      if (mode === 'rich') fill(); else raw.value = source;
      showMode();
    },
    focus() { mode === 'rich' ? editor.commands.focus('end') : raw.focus(); },
    hasFocus: () => rich.contains(document.activeElement) || raw === document.activeElement,
    setEditable(value) { editor.setEditable(value); raw.readOnly = !value; },
  };
}
