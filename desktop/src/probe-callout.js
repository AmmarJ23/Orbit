// The probe callout: what a clicked probe's note says and where its other probes are, with
// quick actions. scene.js decides which probe is selected and positions the card beside it.
import { renderMarkdown } from './markdown.js';
import { DOCK_SLOTS, logos, noteColor, linkStatus, taskLabel, noteTitle, locationLabels, restingPlaces } from './notes-model.js';

const $ = id => document.getElementById(id);
const PREVIEW = 280; // Characters of markdown before the cut-off fade.
const PICKER_ROWS = 40;
const stateOrder = { 'in-progress': 0, 'not-started': 1, completed: 2 };
const element = (tag, className, text) => Object.assign(document.createElement(tag), className ? { className } : {}, text != null ? { textContent: text } : {});

export function createProbeCallout({ controller, focusTask, openNote, onClose }) {
  const card = $('probe-callout');
  let probe = null;
  let notes = new Map(), tasks = [], tasksById = new Map(), resting = new Map(), mode = 'palette';
  let confirming = false;

  const note = () => probe && notes.get(probe.noteId);
  function where(current) {
    if (!probe.link) return resting.get(current.id) === 'belt' ? 'Drifting on the outer belt' : 'Docked at the station';
    const task = tasksById.get(probe.link);
    const status = linkStatus(probe.link, tasksById);
    if (status === 'completed') return 'Orbiting in the completed system';
    if (status === 'orbit') return 'Orbiting ' + (task ? taskLabel(task) : 'its task');
    return locationLabels[status];
  }
  function draw() {
    const current = note();
    if (!current) { hide(); return; }
    $('probe-dot').style.setProperty('--note', noteColor(current, mode));
    card.style.setProperty('--note-here', noteColor(current, mode));
    $('probe-title').textContent = noteTitle(current);
    $('probe-place').textContent = where(current);
    const body = current.body.length > PREVIEW ? current.body.slice(0, PREVIEW) + '…' : current.body;
    $('probe-preview').innerHTML = renderMarkdown(body);
    $('probe-preview').hidden = !current.body.trim();
    const links = $('probe-links');
    if (!current.links.length) links.replaceChildren(element('span', 'note-chip', 'Unlinked'));
    else links.replaceChildren(...current.links.map(id => {
      const task = tasksById.get(id);
      const status = linkStatus(id, tasksById);
      const chip = element('span', 'note-chip');
      chip.dataset.status = status;
      chip.classList.toggle('here', id === probe.link);
      chip.append(Object.assign(element('img'), { src: logos[task?.source] ?? logos.Redmine, alt: '' }));
      const name = element('button', 'chip-name', task ? taskLabel(task) : 'Unavailable task');
      name.type = 'button';
      name.title = status === 'out-of-range' ? 'Out of range · task hidden' : name.textContent;
      name.disabled = status === 'out-of-range' || status === 'unavailable';
      name.onclick = () => focusTask(id);
      chip.append(name);
      if (status === 'out-of-range') chip.append(element('small', null, 'Out of range'));
      return chip;
    }));
    const pinCap = !current.pinned && [...notes.values()].filter(other => other.pinned).length >= DOCK_SLOTS;
    $('probe-pin').setAttribute('aria-pressed', String(current.pinned));
    $('probe-pin').title = current.pinned ? 'Unpin' : pinCap ? `All ${DOCK_SLOTS} docks are pinned` : 'Pin to a station dock';
    $('probe-pin').setAttribute('aria-label', $('probe-pin').title);
    $('probe-pin').disabled = pinCap;
    $('probe-unlink').hidden = !probe.link;
    $('probe-confirm').hidden = !confirming;
    $('probe-confirm-text').textContent = `Delete “${noteTitle(current)}”? Its probes will be destroyed.`;
    if (!$('probe-picker').hidden) fillPicker();
  }
  function show(next) {
    if (next !== probe) { confirming = false; $('probe-picker').hidden = true; }
    probe = next;
    card.hidden = false;
    draw();
  }
  function hide() {
    if (!probe && card.hidden) return;
    probe = null;
    confirming = false;
    card.hidden = true;
    $('probe-picker').hidden = true;
    onClose?.();
  }
  function fillPicker() {
    const current = note();
    if (!current) return;
    const search = $('probe-picker-search').value.trim().toLowerCase();
    const list = tasks.filter(task => !current.links.includes(task.id) && (!search || taskLabel(task).toLowerCase().includes(search)))
      .sort((a, b) => (a.hidden - b.hidden) || (stateOrder[a.state] - stateOrder[b.state]) || a.title.localeCompare(b.title));
    const rows = list.slice(0, PICKER_ROWS).map(task => {
      const button = element('button', 'picker-row');
      button.type = 'button';
      button.append(Object.assign(element('img'), { src: logos[task.source] ?? logos.Redmine, alt: '' }), element('span', null, taskLabel(task)),
        element('small', null, task.hidden ? 'Hidden' : { 'in-progress': 'In progress', 'not-started': 'Not started', completed: 'Done' }[task.state]));
      button.onclick = () => { $('probe-picker').hidden = true; controller().setNoteLinks(current.id, [...current.links, task.id]); };
      return button;
    });
    $('probe-picker-list').replaceChildren(...rows);
    $('probe-picker-empty').hidden = rows.length > 0;
    $('probe-picker-empty').textContent = tasks.length ? 'No tasks match.' : 'No tasks yet. Connect Redmine or ClickUp in Settings.';
  }

  $('probe-close').onclick = hide;
  $('probe-open').onclick = () => { const id = probe?.noteId; hide(); if (id) openNote(id); };
  $('probe-pin').onclick = () => { const current = note(); if (current) controller().setNotePinned(current.id, !current.pinned); };
  $('probe-unlink').onclick = () => {
    const current = note();
    if (current && probe.link) controller().setNoteLinks(current.id, current.links.filter(id => id !== probe.link));
  };
  $('probe-link').onclick = () => {
    const picker = $('probe-picker');
    picker.hidden = !picker.hidden;
    $('probe-link').setAttribute('aria-expanded', String(!picker.hidden));
    if (picker.hidden) return;
    $('probe-picker-search').value = '';
    fillPicker();
    $('probe-picker-search').focus();
  };
  $('probe-picker-search').oninput = fillPicker;
  $('probe-picker-search').onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); $('probe-picker-list').querySelector('button')?.click(); }
    if (event.key === 'Escape') { event.stopPropagation(); $('probe-picker').hidden = true; $('probe-link').focus(); }
  };
  $('probe-delete').onclick = () => { confirming = true; draw(); $('probe-confirm-cancel').focus(); };
  $('probe-confirm-cancel').onclick = () => { confirming = false; draw(); };
  $('probe-confirm-delete').onclick = async () => {
    const current = note();
    if (current && await controller().deleteNote(current.id)) hide();
  };

  return {
    show, hide, draw,
    get probe() { return probe; },
    get open() { return !card.hidden; },
    // Escape closes the picker or confirmation first, then the card.
    escape() {
      if (!$('probe-picker').hidden) { $('probe-picker').hidden = true; return true; }
      if (confirming) { confirming = false; draw(); return true; }
      if (!card.hidden) { hide(); return true; }
      return false;
    },
    render(snapshot) {
      notes = new Map((snapshot.notes ?? []).map(item => [item.id, item]));
      tasks = snapshot.tasks;
      tasksById = new Map(tasks.map(task => [task.id, task]));
      resting = restingPlaces(snapshot.notes ?? []);
      mode = snapshot.preferences.noteColors;
      if (probe) draw();
    },
    titleOf: target => noteTitle(notes.get(target.noteId) ?? { title: '' }),
  };
}
