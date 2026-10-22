// Notes tab: notes listed beside the editor, or as a card grid with the editor in a sheet.
// Pinned notes sit on top in both. Each note is a probe in the scene, one per linked task,
// so the list says where every probe is. Also fills the "Personal notes" side card.
import { createNoteEditor } from './note-editor.js';
import { renderMarkdown } from './markdown.js';
import { DOCK_SLOTS, logos, noteColor, colourKey, restingPlaces, linkStatus, noteLocations, locationLabels, taskLabel, noteTitle } from './notes-model.js';
import { defaultPreferences } from './app-controller.js';

const $ = id => document.getElementById(id);
const SAVE_DELAY = 500;
const CARD_ROWS = 8;
const PICKER_ROWS = 60;
// Times read newest first; titles and colours read A to Z.
const naturalDescending = { edited: true, created: true, title: false, colour: false };
const sortNames = { edited: 'Last edited', created: 'Created', title: 'Title', colour: 'Colour' };
const filterPlaces = ['docked', 'belt', 'orbit', 'completed', 'out-of-range'];
const stateOrder = { 'in-progress': 0, 'not-started': 1, completed: 2 };
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function ago(time) {
  const seconds = (time - Date.now()) / 1000;
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return 'just now';
}
const element = (tag, className, text) => Object.assign(document.createElement(tag), className ? { className } : {}, text != null ? { textContent: text } : {});

export function createNotesView({ controller, focusTask, setView }) {
  const view = $('notes-view');
  let notes = [], byId = new Map(), tasks = [], tasksById = new Map(), resting = new Map();
  let preferences = defaultPreferences;
  let open = false, closing;
  let selectedId = null, sheet = false, query = '';
  const filters = { link: 'all', places: new Set(), sources: new Set(), colours: new Set() };
  // The editor shows `loadedId`; typing waits SAVE_DELAY before it is saved.
  let loadedId = null, pending = null;
  const editor = createNoteEditor({ onInput: queueSave });

  const settings = () => ({ ...defaultPreferences.notesView, ...preferences.notesView });
  const colorOf = note => noteColor(note, preferences.noteColors);
  const saveSettings = patch => controller().savePreferences({ notesView: { ...settings(), ...patch } });

  function setOpen(value) {
    if (value === open) return;
    if (!value) { flush(); closeMenus(); }
    open = value;
    clearTimeout(closing);
    view.classList.remove('closing');
    // Same close animation and timing as the Tasks tab.
    if (value || view.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) view.hidden = !value;
    else {
      view.classList.add('closing');
      closing = setTimeout(() => { view.classList.remove('closing'); view.hidden = true; }, 140);
    }
    if (value) { draw(); $('notes-search').focus(); }
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !open || document.querySelector('dialog[open]')) return;
    if (closeMenus()) return;
    if (!$('note-confirm').hidden) { $('note-confirm').hidden = true; return; }
    // Escape leaves the editor before it leaves the tab.
    if ($('note-pane').contains(document.activeElement)) { document.activeElement.blur(); return; }
    if (sheet) { setSheet(false); return; }
    setView('overview');
  });
  // Unsaved typing is saved when Orbit is hidden or closed.
  document.addEventListener('visibilitychange', flush);
  addEventListener('pagehide', flush);

  function queueSave() {
    clearTimeout(pending);
    pending = setTimeout(flush, SAVE_DELAY);
    $('note-saved').textContent = 'Editing…';
  }
  function flush() {
    if (pending == null || !loadedId) return;
    clearTimeout(pending);
    pending = null;
    controller().saveNote(loadedId, $('note-title').value, editor.markdown).then(saved => { if (saved) showSaved(); });
  }
  $('note-title').addEventListener('input', queueSave);
  $('note-title').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); editor.focus(); } });

  // Notes, tasks and the remembered view arrive with every snapshot.
  function render(snapshot) {
    notes = snapshot.notes ?? [];
    byId = new Map(notes.map(note => [note.id, note]));
    tasks = snapshot.tasks;
    tasksById = new Map(tasks.map(task => [task.id, task]));
    resting = restingPlaces(notes);
    preferences = snapshot.preferences ?? defaultPreferences;
    if (selectedId && !byId.has(selectedId)) { selectedId = null; setSheet(false); }
    $('note-colors').value = preferences.noteColors ?? 'palette';
    renderCard();
    draw();
  }

  function matchesFilters(note) {
    const text = query && !(note.title.toLowerCase().includes(query) || note.body.toLowerCase().includes(query));
    if (text) return false;
    if (filters.link === 'linked' && !note.links.length) return false;
    if (filters.link === 'unlinked' && note.links.length) return false;
    if (filters.places.size && !noteLocations(note, tasksById, resting).some(place => filters.places.has(place))) return false;
    if (filters.sources.size && !note.links.some(id => filters.sources.has(tasksById.get(id)?.source))) return false;
    return !filters.colours.size || filters.colours.has(colorOf(note));
  }
  function sorted(list) {
    const { sort, descending } = settings();
    const compare = {
      edited: (a, b) => a.edited - b.edited,
      created: (a, b) => a.created - b.created,
      title: (a, b) => noteTitle(a).localeCompare(noteTitle(b)),
      colour: (a, b) => colourKey(a, preferences.noteColors) - colourKey(b, preferences.noteColors) || b.edited - a.edited,
    }[sort] ?? ((a, b) => a.edited - b.edited);
    return list.slice().sort((a, b) => descending ? compare(b, a) : compare(a, b));
  }
  const activeFilters = () => (filters.link !== 'all') + (filters.places.size > 0) + (filters.sources.size > 0) + (filters.colours.size > 0);

  function chip(id, { removable = false } = {}) {
    const task = tasksById.get(id);
    const status = linkStatus(id, tasksById);
    const item = element('span', 'note-chip');
    item.dataset.status = status;
    if (task) item.append(Object.assign(element('img'), { src: logos[task.source] ?? logos.Redmine, alt: '' }));
    const label = task ? taskLabel(task) : 'Task unavailable';
    const name = removable && task && !task.hidden ? element('button', 'chip-name', label) : element('span', null, label);
    if (name.tagName === 'BUTTON') {
      name.type = 'button';
      name.title = 'Show in orbit';
      name.onclick = () => { flush(); setView('overview'); focusTask(id); };
    }
    item.append(name);
    if (status === 'out-of-range') item.title = 'Out of range · task hidden';
    else if (status === 'unavailable') item.title = 'This task is not in a connected account';
    else if (status === 'completed') item.title = 'In the completed system';
    if (removable) {
      const remove = element('button', 'chip-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Unlink ' + label);
      remove.onclick = () => { const note = byId.get(loadedId); if (note) controller().setNoteLinks(note.id, note.links.filter(link => link !== id)); };
      item.append(remove);
    }
    return item;
  }
  function meta(note) {
    const box = element('span', 'note-meta');
    if (note.links.length) box.append(...note.links.map(id => chip(id)));
    else box.textContent = 'Unlinked · ' + locationLabels[resting.get(note.id) ?? 'docked'].toLowerCase();
    return box;
  }
  function row(note) {
    const button = element('button', 'note-row');
    button.type = 'button';
    button.style.setProperty('--note', colorOf(note));
    button.setAttribute('aria-current', String(note.id === selectedId));
    const main = element('span', 'note-row-main');
    main.append(element('span', 'note-row-title', noteTitle(note)), meta(note));
    button.append(element('i', 'note-dot'), main, element('span', 'note-time', ago(note.edited)));
    button.onclick = () => select(note.id);
    return button;
  }
  function card(note) {
    const item = element('div', 'note-card');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', 'Open ' + noteTitle(note));
    item.setAttribute('aria-current', String(sheet && note.id === selectedId));
    item.style.setProperty('--note', colorOf(note));
    const preview = element('div', 'note-card-preview markdown');
    preview.innerHTML = renderMarkdown(note.body);
    const head = element('div', 'note-card-head');
    head.append(element('strong', null, noteTitle(note)));
    if (note.pinned) head.append(Object.assign(element('span', 'note-pin-mark'), { innerHTML: icons.pin, title: 'Pinned' }));
    item.append(head, preview, meta(note));
    item.onclick = () => { if (note.id !== selectedId) flush(); selectedId = note.id; setSheet(true); };
    item.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); } };
    return item;
  }
  function group(label, list, make, grid) {
    const section = element('section', 'note-group');
    section.append(element('h3', 'note-group-title', label));
    const items = element('div', grid ? 'notes-grid' : 'notes-rows');
    items.append(...list.map(make));
    section.append(items);
    return section;
  }

  function draw() {
    const { layout, sort, descending } = settings();
    const grid = layout === 'grid';
    view.dataset.layout = layout;
    view.classList.toggle('sheet-open', grid && sheet && !!selectedId);
    for (const button of document.querySelectorAll('#notes-layout [data-layout]')) button.setAttribute('aria-pressed', String(button.dataset.layout === layout));
    $('notes-sort').title = `Sorted by ${sortNames[sort].toLowerCase()}${descending !== naturalDescending[sort] ? ', reversed' : ''}`;
    const count = activeFilters();
    $('notes-filter-count').hidden = !count;
    $('notes-filter-count').textContent = count;
    const pinned = notes.filter(note => note.pinned).length;
    $('notes-summary').textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}${pinned ? ` · ${pinned} pinned` : ''} · ${notes.reduce((sum, note) => sum + Math.max(1, note.links.length), 0)} probes`;
    if (!open) return;
    // List view always has a note open when there is one.
    const shown = sorted(notes.filter(matchesFilters));
    if (!grid && !selectedId && shown.length) selectedId = shown.find(note => note.pinned)?.id ?? shown[0].id;
    const make = grid ? card : row;
    const sections = [];
    const top = shown.filter(note => note.pinned), rest = shown.filter(note => !note.pinned);
    if (top.length) sections.push(group('PINNED', top, make, grid));
    if (rest.length) sections.push(group(top.length ? 'ALL NOTES' : 'NOTES', rest, make, grid));
    const items = $('notes-items');
    const scroll = items.scrollTop;
    items.replaceChildren(...sections);
    items.scrollTop = scroll;
    $('notes-start').hidden = notes.length > 0;
    $('notes-none').hidden = !notes.length || shown.length > 0;
    drawEditor();
  }

  function drawEditor() {
    const note = byId.get(selectedId);
    $('note-pane').hidden = !note;
    $('note-pane-empty').hidden = !!note || settings().layout === 'grid' || !notes.length;
    if (!note) { loadedId = null; return; }
    // Typing in progress wins over a snapshot that still holds the previous text.
    const editing = pending != null || editor.hasFocus() || document.activeElement === $('note-title');
    if (loadedId !== note.id) {
      flush();
      loadedId = note.id;
      $('note-title').value = note.title;
      editor.load(note.body);
      $('note-confirm').hidden = true;
      closeMenus();
    } else if (!editing && ($('note-title').value !== note.title || editor.markdown !== note.body)) {
      $('note-title').value = note.title;
      editor.load(note.body);
    }
    editor.setMode(settings().editor);
    for (const button of document.querySelectorAll('#note-mode [data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === editor.mode));
    $('note-pane').style.setProperty('--note', colorOf(note));
    const pins = notes.filter(other => other.pinned).length;
    const pin = $('note-pin');
    pin.setAttribute('aria-pressed', String(note.pinned));
    pin.disabled = !note.pinned && pins >= DOCK_SLOTS;
    pin.title = note.pinned ? 'Unpin' : pin.disabled ? `All ${DOCK_SLOTS} station docks are pinned. Unpin a note first.` : 'Pin: keeps its probe docked at the station';
    pin.setAttribute('aria-label', note.pinned ? 'Unpin note' : 'Pin note');
    const links = $('note-links');
    links.replaceChildren(...note.links.map(id => chip(id, { removable: true })));
    if (!note.links.length) links.append(element('span', 'note-meta', 'Unlinked · ' + (resting.get(note.id) === 'belt' ? 'drifting on the belt' : 'docked at the station')));
    if (pending == null) showSaved();
  }
  function showSaved() {
    const note = byId.get(loadedId);
    if (note && pending == null) $('note-saved').textContent = 'Edited ' + ago(note.edited);
  }
  setInterval(() => { if (open) showSaved(); }, 30000);

  function select(id) {
    if (id !== selectedId) flush();
    selectedId = id;
    draw();
  }
  // Grid view shows the editor as a sheet over the cards.
  function setSheet(value) {
    if (!value) flush();
    sheet = value;
    draw();
  }
  async function create() {
    flush();
    const id = crypto.randomUUID();
    if (!await controller().saveNote(id, '', '')) return;
    selectedId = id;
    setSheet(true);
    $('note-title').focus();
  }

  // Header: search, sort, filter, layout and New note.
  $('notes-search').oninput = event => { query = event.target.value.trim().toLowerCase(); draw(); };
  $('notes-new').onclick = create;
  $('notes-start-new').onclick = create;
  for (const button of document.querySelectorAll('#notes-layout [data-layout]')) button.onclick = () => { flush(); sheet = false; saveSettings({ layout: button.dataset.layout }); };
  for (const button of document.querySelectorAll('#note-mode [data-mode]')) button.onclick = () => {
    editor.setMode(button.dataset.mode);
    saveSettings({ editor: button.dataset.mode });
    editor.focus();
  };
  $('note-close').onclick = () => setSheet(false);
  $('note-pin').onclick = () => { const note = byId.get(loadedId); if (note) controller().setNotePinned(note.id, !note.pinned); };
  $('note-delete').onclick = () => {
    const note = byId.get(loadedId);
    if (!note) return;
    const probes = Math.max(1, note.links.length);
    $('note-confirm-text').textContent = `Delete “${noteTitle(note)}”? Its ${probes === 1 ? 'probe' : probes + ' probes'} will be destroyed. This can't be undone.`;
    $('note-confirm').hidden = false;
    $('note-confirm-cancel').focus();
  };
  $('note-confirm-cancel').onclick = () => { $('note-confirm').hidden = true; };
  $('note-confirm-delete').onclick = async () => {
    const id = loadedId;
    clearTimeout(pending);
    pending = null;
    $('note-confirm').hidden = true;
    if (await controller().deleteNote(id)) { selectedId = null; setSheet(false); }
  };
  $('note-colors').onchange = event => controller().savePreferences({ noteColors: event.target.value });

  // Menus: sort, filter and the task picker. Only one is open at a time.
  const menus = ['notes-sort-menu', 'notes-filter-menu', 'note-picker'];
  function closeMenus() {
    let closed = false;
    for (const id of menus) if (!$(id).hidden) { $(id).hidden = true; closed = true; }
    for (const id of ['notes-sort', 'notes-filter', 'note-link']) $(id).setAttribute('aria-expanded', 'false');
    return closed;
  }
  function toggleMenu(menuId, buttonId, fill) {
    const wasOpen = !$(menuId).hidden;
    closeMenus();
    if (wasOpen) return;
    fill();
    $(menuId).hidden = false;
    $(buttonId).setAttribute('aria-expanded', 'true');
    const panel = view.getBoundingClientRect(), button = $(buttonId).getBoundingClientRect(), menu = $(menuId);
    menu.style.top = button.bottom - panel.top + 6 + 'px';
    menu.style.left = Math.max(12, Math.min(button.right - panel.left - menu.offsetWidth, panel.width - menu.offsetWidth - 12)) + 'px';
    menu.querySelector('input, button')?.focus();
  }
  document.addEventListener('pointerdown', event => {
    if (open && !event.target.closest('.notes-menu, #notes-sort, #notes-filter, #note-link')) closeMenus();
  });
  const option = (text, pressed, onClick, role = 'menuitemcheckbox') => {
    const button = element('button', 'menu-option', text);
    button.type = 'button';
    button.setAttribute('role', role);
    button.setAttribute('aria-checked', String(pressed));
    button.onclick = onClick;
    return button;
  };
  function fillSort() {
    const { sort, descending } = settings();
    const menu = $('notes-sort-menu');
    menu.replaceChildren(element('p', 'menu-title', 'Sort by'),
      ...Object.entries(sortNames).map(([id, name]) => option(name, id === sort, () => { saveSettings({ sort: id, descending: naturalDescending[id] }); closeMenus(); }, 'menuitemradio')),
      element('hr'),
      option('Reverse order', descending !== naturalDescending[sort], () => { saveSettings({ descending: !descending }); closeMenus(); }));
  }
  function fillFilter() {
    const menu = $('notes-filter-menu');
    const toggle = (set, value) => () => { set.has(value) ? set.delete(value) : set.add(value); fillFilter(); draw(); };
    const link = element('div', 'segmented menu-segmented');
    link.setAttribute('role', 'group');
    link.setAttribute('aria-label', 'Links');
    for (const [id, name] of [['all', 'All'], ['unlinked', 'Unlinked'], ['linked', 'Linked']]) {
      const button = element('button', null, name);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(filters.link === id));
      button.onclick = () => { filters.link = id; fillFilter(); draw(); };
      link.append(button);
    }
    const colours = [...new Set(notes.map(colorOf))];
    const swatches = element('div', 'menu-swatches');
    swatches.append(...colours.map(colour => {
      const button = element('button', 'swatch');
      button.type = 'button';
      button.style.setProperty('--note', colour);
      button.setAttribute('aria-pressed', String(filters.colours.has(colour)));
      button.setAttribute('aria-label', 'Colour ' + colour);
      button.onclick = toggle(filters.colours, colour);
      return button;
    }));
    const clear = element('button', 'quiet menu-clear', 'Clear filters');
    clear.type = 'button';
    clear.disabled = !activeFilters();
    clear.onclick = () => { filters.link = 'all'; filters.places.clear(); filters.sources.clear(); filters.colours.clear(); fillFilter(); draw(); };
    menu.replaceChildren(element('p', 'menu-title', 'Links'), link,
      element('p', 'menu-title', 'Where the probe is'), ...filterPlaces.map(place => option(locationLabels[place], filters.places.has(place), toggle(filters.places, place))),
      element('p', 'menu-title', 'Linked source'), ...['Redmine', 'ClickUp'].map(source => option(source, filters.sources.has(source), toggle(filters.sources, source))),
      ...(colours.length ? [element('p', 'menu-title', 'Colour'), swatches] : []),
      element('hr'), clear);
  }
  $('notes-sort').onclick = () => toggleMenu('notes-sort-menu', 'notes-sort', fillSort);
  $('notes-filter').onclick = () => toggleMenu('notes-filter-menu', 'notes-filter', fillFilter);

  // Linking: pick any task Orbit knows. Hidden ones are listed last; their probe goes out of range.
  function fillPicker() {
    const note = byId.get(loadedId);
    const search = $('note-picker-search').value.trim().toLowerCase();
    const list = tasks.filter(task => !note?.links.includes(task.id) && (!search || taskLabel(task).toLowerCase().includes(search)))
      .sort((a, b) => (a.hidden - b.hidden) || (stateOrder[a.state] - stateOrder[b.state]) || a.title.localeCompare(b.title));
    const rows = list.slice(0, PICKER_ROWS).map(task => {
      const button = element('button', 'picker-row');
      button.type = 'button';
      button.append(Object.assign(element('img'), { src: logos[task.source] ?? logos.Redmine, alt: '' }), element('span', null, taskLabel(task)),
        element('small', null, task.hidden ? 'Hidden' : { 'in-progress': 'In progress', 'not-started': 'Not started', completed: 'Done' }[task.state]));
      button.onclick = () => { closeMenus(); if (note) controller().setNoteLinks(note.id, [...note.links, task.id]); };
      return button;
    });
    $('note-picker-list').replaceChildren(...rows);
    $('note-picker-empty').hidden = rows.length > 0;
    $('note-picker-empty').textContent = tasks.length ? 'No tasks match.' : 'No tasks yet. Connect Redmine or ClickUp in Settings.';
  }
  $('note-link').onclick = () => { $('note-picker-search').value = ''; toggleMenu('note-picker', 'note-link', fillPicker); };
  $('note-picker-search').oninput = fillPicker;
  $('note-picker-search').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('note-picker-list').querySelector('button')?.click(); } };

  // Side card: a summary, pinned first. The full list lives in the tab.
  function renderCard() {
    const ordered = notes.slice().sort((a, b) => (b.pinned - a.pinned) || (b.edited - a.edited));
    const shown = ordered.slice(0, CARD_ROWS);
    $('notes-count').textContent = notes.length || '';
    $('notes-empty').hidden = notes.length > 0;
    $('notes-more').hidden = ordered.length <= CARD_ROWS;
    $('notes-more').textContent = `${ordered.length - CARD_ROWS} more · Open in Notes`;
    $('notes-card-list').replaceChildren(...shown.map(note => {
      const item = element('li');
      const button = element('button', 'task-row');
      button.type = 'button';
      const dot = element('i', 'dot note-dot');
      dot.style.setProperty('--note', colorOf(note));
      button.append(dot, element('span', null, noteTitle(note)));
      button.title = noteTitle(note) + (note.links.length ? ' · linked to ' + note.links.map(id => tasksById.get(id)?.title ?? 'an unavailable task').join(', ') : ' · unlinked');
      button.onclick = () => openNote(note.id);
      if (note.pinned) button.append(Object.assign(element('span', 'note-pin-mark'), { innerHTML: icons.pin, title: 'Pinned' }));
      item.append(button);
      return item;
    }));
  }
  function openNote(id) {
    selectedId = id;
    sheet = true;
    setView('notes');
    draw();
  }
  $('notes-more').onclick = () => setView('notes');
  $('notes-empty-open').onclick = () => { setView('notes'); create(); };

  return { render, setOpen, openNote };
}

const icons = {
  pin: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 3h5l-.8 5 3 2.5v1.2H5.3v-1.2l3-2.5Z"/><path d="M10 11.7V17"/></svg>',
};
