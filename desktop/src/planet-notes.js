// The notes orbiting a selected planet, shown in its callout. Four styles (a preference): chips
// under the details, coloured dots in the header, rows with a one-line preview, or a Notes tab
// beside the task details. Clicking a note selects its probe; hovering brightens it.
import { noteColor, noteTitle } from './notes-model.js';

const $ = id => document.getElementById(id);
const element = (tag, className, text) => Object.assign(document.createElement(tag), className ? { className } : {}, text != null ? { textContent: text } : {});
// First line of the body as plain text, for the list style.
const firstLine = body => (body.split('\n').map(line => line.trim()).find(Boolean) ?? '')
  .replace(/^(#+|>|[-*+]|\d+\.)\s*/, '').replace(/[*_`~]|\[([^\]]*)\]\([^)]*\)/g, (match, text) => text ?? '');

export function createPlanetNotes({ onPick, onHover }) {
  const card = $('selection'), box = $('planet-notes'), dots = $('planet-moon-dots');
  const tabs = $('planet-tabs'), taskTab = $('planet-tab-task'), notesTab = $('planet-tab-notes');
  let taskId = null, tab = 'task', drawn = '';

  function showTab(next) {
    tab = next;
    taskTab.setAttribute('aria-selected', String(tab === 'task'));
    notesTab.setAttribute('aria-selected', String(tab === 'notes'));
    card.classList.toggle('show-notes', tab === 'notes');
    box.hidden = tab !== 'notes';
  }
  taskTab.onclick = () => showTab('task');
  notesTab.onclick = () => showTab('notes');

  function button(note, className, colors) {
    const item = element('button', className);
    item.type = 'button';
    item.style.setProperty('--note', noteColor(note, colors));
    item.onclick = () => onPick(note.id);
    item.onmouseenter = item.onfocus = () => onHover(note.id);
    item.onmouseleave = item.onblur = () => onHover(null);
    return item;
  }
  function render(task, notes, { style, colors }) {
    if (task?.id !== taskId) { taskId = task?.id ?? null; tab = 'task'; }
    const moons = task ? notes.filter(note => note.links.includes(task.id)).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id)) : [];
    if (!moons.length || style !== 'tabs') tab = 'task';
    // Redraw only when something shown changed, so hover and focus survive frequent refreshes.
    const key = JSON.stringify([style, colors, tab, moons.map(note => [note.id, note.title, note.body.slice(0, 200), note.palette])]);
    if (key === drawn) return;
    drawn = key;
    card.dataset.notes = moons.length ? style : '';
    dots.hidden = style !== 'dots' || !moons.length;
    tabs.hidden = style !== 'tabs' || !moons.length;
    notesTab.textContent = `Notes · ${moons.length}`;
    showTab(tab);
    box.hidden = !moons.length || style === 'dots' || (style === 'tabs' && tab !== 'notes');
    card.style.setProperty('--moon-dots', style === 'dots' ? moons.length : 0);
    if (style === 'dots') {
      dots.replaceChildren(...moons.map(note => {
        const dot = button(note, 'moon-dot', colors);
        dot.title = noteTitle(note);
        dot.setAttribute('aria-label', 'Select note ' + noteTitle(note));
        return dot;
      }));
      box.replaceChildren();
      return;
    }
    dots.replaceChildren();
    const items = moons.map(note => {
      if (style === 'list') {
        const row = button(note, 'planet-note-row', colors);
        const text = element('span', 'planet-note-text');
        text.append(element('span', 'planet-note-title', noteTitle(note)), element('small', null, firstLine(note.body) || 'Empty note'));
        row.append(element('i', 'dot note-dot'), text, element('span', 'planet-note-go', '›'));
        return row;
      }
      const chip = button(note, 'note-chip planet-note-chip', colors);
      chip.append(element('i', 'dot note-dot'), element('span', null, noteTitle(note)));
      return chip;
    });
    const label = style === 'tabs' ? [] : [element('p', 'planet-notes-label', `Moons · ${moons.length}`)];
    const list = element('div', style === 'list' ? 'planet-note-list' : 'planet-note-chips');
    list.append(...items);
    box.replaceChildren(...label, list);
  }
  return { render };
}
