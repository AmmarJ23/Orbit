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
export function createDemoRepository() {
  let sequence = 10;
  const listeners = new Set();
  const snapshot = { mode: 'demo', revision: 0, preferences: { ...defaultPreferences }, sources: {},
    tasks: specs.map(([title, source, state, radius, color, angle, speed], i) => ({
      id: `demo:${i + 1}`, externalId: String(i + 1), title, source, state, seed: i + 19,
      upstreamPresent: true, project: 'Animation testing', priority: null, url: null,
      appearance: { radius, color, angle, speed },
    })) };
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
    async savePreferences(preferences) { snapshot.preferences = { ...preferences }; return publish(false); },
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
