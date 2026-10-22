// The notes orbiting a selected planet, shown in its callout. Four styles (a preference): chips
// under the details, coloured dots in the header, rows with a one-line preview, or a Notes tab
// beside the task details. Clicking a note selects its probe; hovering brightens it. Every style
// ends with two buttons: a new note linked to this task, and a picker to link an existing one.
import { noteColor, noteTitle, restingPlaces, linkStatus, locationLabels } from './notes-model.js';

const $ = id => document.getElementById(id);
const element = (tag, className, text) => Object.assign(document.createElement(tag), className ? { className } : {}, text != null ? { textContent: text } : {});
const PICKER_ROWS = 40;
const icons = {
  create: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 2.8h6l3 3v11.4h-9Z"/><path d="M11.5 2.8v3h3"/><path d="M10 9v5.4M7.3 11.7h5.4"/></svg>',
  link: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9"/></svg>',
};
// First line of the body as plain text, for the list style.
const firstLine = body => (body.split('\n').map(line => line.trim()).find(Boolean) ?? '')
  .replace(/^(#+|>|[-*+]|\d+\.)\s*/, '').replace(/[*_`~]|\[([^\]]*)\]\([^)]*\)/g, (match, text) => text ?? '');

export function createPlanetNotes({ onPick, onHover, onCreate, onLink }) {
  const card = $('selection'), box = $('planet-notes'), dots = $('planet-moon-dots');
  const tabs = $('planet-tabs'), taskTab = $('planet-tab-task'), notesTab = $('planet-tab-notes');
  const picker = $('planet-note-picker'), search = $('planet-note-search');
  let task = null, notes = [], tasksById = new Map(), colors = 'palette';
  let tab = 'task', drawn = '';

  function showTab(next) {
    tab = next;
    taskTab.setAttribute('aria-selected', String(tab === 'task'));
    notesTab.setAttribute('aria-selected', String(tab === 'notes'));
    card.classList.toggle('show-notes', tab === 'notes');
    if (!tabs.hidden) box.hidden = tab !== 'notes';
    if (tab === 'task') closePicker();
  }
  taskTab.onclick = () => showTab('task');
  notesTab.onclick = () => showTab('notes');

  function noteButton(note, className) {
    const item = element('button', className);
    item.type = 'button';
    item.style.setProperty('--note', noteColor(note, colors));
    item.onclick = () => onPick(note.id);
    item.onmouseenter = item.onfocus = () => onHover(note.id);
    item.onmouseleave = item.onblur = () => onHover(null);
    return item;
  }
  // New note for this task, and link an existing one. `labelled` adds text beside the icons.
  function actions(className, labelled) {
    const name = task?.title ?? 'this task';
    return [['create', 'New note for ' + name, 'New note', () => { closePicker(); onCreate(task.id); }],
      ['link', 'Link a note', 'Link a note', togglePicker]].map(([icon, title, label, onclick]) => {
      const button = element('button', className);
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.innerHTML = icons[icon];
      if (labelled) button.append(element('span', null, label));
      if (icon === 'link') { button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', String(!picker.hidden)); button.dataset.picker = ''; }
      button.onclick = onclick;
      return button;
    });
  }

  function closePicker() {
    picker.hidden = true;
    for (const button of card.querySelectorAll('[data-picker]')) button.setAttribute('aria-expanded', 'false');
  }
  function togglePicker() {
    if (!picker.hidden) { closePicker(); return; }
    search.value = '';
    fillPicker();
    picker.hidden = false;
    for (const button of card.querySelectorAll('[data-picker]')) button.setAttribute('aria-expanded', 'true');
    search.focus();
  }
  // Notes not yet on this planet: pinned first, then most recently edited.
  function fillPicker() {
    if (!task) return;
    const query = search.value.trim().toLowerCase();
    const resting = restingPlaces(notes);
    const list = notes.filter(note => !note.links.includes(task.id) && (!query || (noteTitle(note) + '\n' + note.body).toLowerCase().includes(query)))
      .sort((a, b) => (b.pinned - a.pinned) || (b.edited - a.edited));
    const rows = list.slice(0, PICKER_ROWS).map(note => {
      const row = element('button', 'picker-row planet-picker-row');
      row.type = 'button';
      row.style.setProperty('--note', noteColor(note, colors));
      const where = note.links.length
        ? note.links.length > 1 ? `${note.links.length} tasks` : locationLabels[linkStatus(note.links[0], tasksById)]
        : locationLabels[resting.get(note.id) ?? 'docked'];
      row.append(element('i', 'dot note-dot'), element('span', null, noteTitle(note)), element('small', null, where));
      row.onclick = () => { closePicker(); onLink(note, task.id); };
      return row;
    });
    $('planet-note-list').replaceChildren(...rows);
    $('planet-note-empty').hidden = rows.length > 0;
    $('planet-note-empty').textContent = notes.length ? query ? 'No notes match.' : 'Every note is already on this planet.' : 'No notes yet. Use New note to write one.';
  }
  search.oninput = fillPicker;
  search.onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); $('planet-note-list').querySelector('button')?.click(); }
    if (event.key === 'Escape') { event.stopPropagation(); closePicker(); card.querySelector('[data-picker]')?.focus(); }
  };

  function render(nextTask, allNotes, snapshotTasks, { style, colors: mode }) {
    if (nextTask?.id !== task?.id) { tab = 'task'; closePicker(); }
    task = nextTask; notes = allNotes; colors = mode;
    tasksById = new Map(snapshotTasks.map(item => [item.id, item]));
    if (!picker.hidden) fillPicker();
    const moons = task ? notes.filter(note => note.links.includes(task.id)).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id)) : [];
    if (style !== 'tabs') tab = 'task';
    // Redraw only when something shown changed, so hover and focus survive frequent refreshes.
    const key = JSON.stringify([task?.id, task?.title, style, colors, tab, moons.map(note => [note.id, note.title, note.body.slice(0, 200), note.palette])]);
    if (key === drawn) return;
    drawn = key;
    card.dataset.notes = style;
    dots.hidden = style !== 'dots';
    tabs.hidden = style !== 'tabs';
    notesTab.textContent = `Notes · ${moons.length}`;
    showTab(tab);
    box.hidden = style === 'dots' || (style === 'tabs' && tab !== 'notes');
    if (style === 'dots') {
      dots.replaceChildren(...moons.map(note => {
        const dot = noteButton(note, 'moon-dot');
        dot.title = noteTitle(note);
        dot.setAttribute('aria-label', 'Select note ' + noteTitle(note));
        return dot;
      }), ...actions('moon-action'));
      card.style.setProperty('--moon-dots-width', `${moons.length * 16 + 50}px`);
      box.replaceChildren();
      return;
    }
    card.style.setProperty('--moon-dots-width', '0px');
    dots.replaceChildren();
    const label = style === 'tabs' ? [] : [element('p', 'planet-notes-label', `Moons · ${moons.length}`)];
    if (style === 'list') {
      const list = element('div', 'planet-note-list');
      list.append(...moons.map(note => {
        const row = noteButton(note, 'planet-note-row');
        const text = element('span', 'planet-note-text');
        text.append(element('span', 'planet-note-title', noteTitle(note)), element('small', null, firstLine(note.body) || 'Empty note'));
        row.append(element('i', 'dot note-dot'), text, element('span', 'planet-note-go', '›'));
        return row;
      }));
      const footer = element('div', 'planet-note-footer');
      footer.append(...actions('planet-note-labelled', true));
      list.append(footer);
      box.replaceChildren(...label, list);
      return;
    }
    const chips = element('div', 'planet-note-chips');
    chips.append(...moons.map(note => {
      const chip = noteButton(note, 'note-chip planet-note-chip');
      chip.append(element('i', 'dot note-dot'), element('span', null, noteTitle(note)));
      return chip;
    }), ...actions('planet-note-action'));
    box.replaceChildren(...label, chips);
  }
  return {
    render,
    // Escape closes the picker first.
    escape() { if (picker.hidden) return false; closePicker(); return true; },
  };
}
