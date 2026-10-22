import { defaultPreferences } from './app-controller.js';

const specs = [
  ['Lyra', 'Redmine', 'in-progress', 0.62, 0x79bfff, 2.3, 0.052],
  ['Vega', 'Redmine', 'in-progress', 0.43, 0x4898d9, 5.4, 0.045],
  ['Elara', 'Redmine', 'in-progress', 0.29, 0xb6e1ff, 0.3, 0.058],
  ['Mira', 'ClickUp', 'in-progress', 0.76, 0x8ad8ed, 3.7, 0.029],
  ['Atlas', 'ClickUp', 'in-progress', 0.58, 0x559bcf, 0.6, 0.034],
  ['Nova', 'ClickUp', 'in-progress', 0.42, 0xa2d3ff, 5.2, 0.025],
  ['Cinder', 'Redmine', 'not-started', 0.65, 0x64789b, 2.4, 0],
  ['Echo', 'ClickUp', 'not-started', 0.38, 0x465d7a, 0.1, 0],
  ['Solace', 'ClickUp', 'not-started', 0.53, 0x8095ac, 4.8, 0],
];
const PALETTE_SIZE = 8, DOCK_SLOTS = 10;
const sampleNotes = [
  ['Sprint ideas', '- Pair on the **orbit transfer** easing\n- Try a slower belt drift', [], true],
  ['Login timeout', 'Users get logged out after **5 min** on the VPN.\n\n- Check `session.ttl`\n- Ask infra about the proxy', ['demo:1'], true],
  ['API quirks', '## Pagination\nClickUp pages are **zero-based**; Redmine uses `offset`.', ['demo:4', 'demo:2'], false],
  ['Standup notes', 'Blocked on review. Demo the probes on Friday.', [], false],
];
export function createDemoRepository() {
  let sequence = 10;
  const listeners = new Set();
  const snapshot = { mode: 'demo', revision: 0, preferences: { ...defaultPreferences }, sources: {},
    tasks: specs.map(([title, source, state, radius, color, angle, speed], i) => ({
      id: `demo:${i + 1}`, externalId: String(i + 1), title, source, state, seed: i + 19,
      // Echo and Solace are ClickUp subtasks of Mira, so the Tasks tab shows nesting.
      parentId: ['Echo', 'Solace'].includes(title) ? 'demo:4' : null,
      upstreamPresent: true, project: 'Animation testing', priority: null, url: null,
      appearance: { radius, color, angle, speed },
    })),
    notes: sampleNotes.map(([title, body, links, pinned], i) => {
      const time = Date.now() - (sampleNotes.length - i) * 3600e3;
      return { id: `demo-note-${i + 1}`, title, body, links, pinned, palette: i % PALETTE_SIZE, created: time, edited: time, rested: time };
    }) };
  const note = id => {
    const found = snapshot.notes.find(note => note.id === id);
    if (!found) throw new Error('This note no longer exists.');
    return found;
  };
  const getSnapshot = async () => structuredClone(snapshot);
  async function publish(animate) {
    snapshot.revision++;
    const result = await getSnapshot();
    for (const handler of listeners) handler({ snapshot: result, animate });
    return result;
  }
  return {
    getSnapshot, subscribe: async handler => { listeners.add(handler); return () => listeners.delete(handler); },
    async setState(id, state) {
      const task = snapshot.tasks.find(task => task.id === id);
      if (!task) throw new Error('Sample planet not found.');
      task.completedFrom = state === 'completed' ? task.state : null;
      task.state = state;
      return publish(true);
    },
    async setHidden(ids, hidden) {
      for (const task of snapshot.tasks) if (ids.includes(task.id)) task.hidden = hidden;
      return publish(true);
    },
    async savePreferences(preferences) { snapshot.preferences = { ...preferences }; return publish(false); },
    // Same rules as the native service (service.rs).
    async saveNote(id, title, body) {
      title = title.trim();
      const existing = snapshot.notes.find(note => note.id === id);
      if (existing) {
        if (existing.title === title && existing.body === body) return getSnapshot();
        Object.assign(existing, { title, body, edited: Date.now() });
      } else {
        const used = Array(PALETTE_SIZE).fill(0);
        for (const note of snapshot.notes) used[note.palette % PALETTE_SIZE]++;
        const time = Date.now();
        snapshot.notes.push({ id, title, body, links: [], pinned: false, palette: used.indexOf(Math.min(...used)), created: time, edited: time, rested: time });
      }
      return publish(false);
    },
    async setNotePinned(id, pinned) {
      if (pinned && snapshot.notes.filter(note => note.pinned && note.id !== id).length >= DOCK_SLOTS) {
        throw new Error(`Up to ${DOCK_SLOTS} notes can be pinned, one for each station dock. Unpin one first.`);
      }
      note(id).pinned = pinned;
      return publish(true);
    },
    async setNoteLinks(id, links) {
      const target = note(id);
      links = [...new Set(links)];
      if (!links.length && target.links.length) target.rested = Date.now();
      target.links = links;
      return publish(true);
    },
    async deleteNote(id) {
      note(id);
      snapshot.notes = snapshot.notes.filter(note => note.id !== id);
      return publish(true);
    },
    async addTask(title, source, state) {
      const id = sequence++;
      snapshot.tasks.push({ id: `demo:${id}`, externalId: String(id), title, source, state, seed: id * 193,
        upstreamPresent: true, project: 'Animation testing', priority: null, url: null });
      await publish(true);
      return `demo:${id}`;
    },
  };
}

export function setupDemoTools({ repository, controller, selectTask }) {
  const $ = id => document.getElementById(id);
  const hint = () => {
    $('placement-hint').textContent = $('new-status').value === 'in-progress'
      ? `Starts in the ${$('new-source').value === 'Redmine' ? 'inner Redmine' : 'outer ClickUp'} orbit.`
      : 'Starts on the outer waiting ring. Enter orbit whenever you’re ready.';
  };
  $('new-source').onchange = hint;
  $('new-status').onchange = hint;
  const dialog = $('new-task-dialog');
  $('new-task').onclick = () => { $('planet-form').reset(); $('planet-added').textContent = ''; hint(); dialog.showModal(); $('new-name').focus(); };
  $('clear-planet-form').onclick = () => dialog.close();
  $('planet-form').onsubmit = async event => {
    event.preventDefault();
    const name = $('new-name').value.trim();
    if (!name) return;
    const id = await repository.addTask(name, $('new-source').value, $('new-status').value);
    $('new-name').value = '';
    dialog.close();
    selectTask(id);
  };
  $('complete-active').onclick = async () => {
    const active = controller.snapshot.tasks.filter(task => task.state === 'in-progress');
    for (const task of active) await controller.setState(task.id, 'completed');
  };
}
