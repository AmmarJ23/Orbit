const $ = id => document.getElementById(id);
const stateLabel = state => ({ 'not-started': 'To do', 'in-progress': 'Doing', completed: 'Done' })[state];

export function setupSettingsTabs() {
  const tabs = [...document.querySelectorAll('.testing-tabs [role=tab]')];
  const show = tab => {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      $(item.getAttribute('aria-controls')).hidden = !active;
    }
  };
  for (const [i, tab] of tabs.entries()) {
    tab.onclick = () => show(tab);
    tab.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
      show(tabs[next]); tabs[next].focus();
    };
  }
}

export function createAppUI({ controller, selectTask, selectedId }) {
  const rows = new Map();
  let connectionBusy = false;
  let lastSnapshot;
  let configuredServer;
  if ($('connection-form')) {
    $('connection-form').onsubmit = async event => {
      event.preventDefault();
      const baseUrl = $('redmine-url').value;
      const key = $('redmine-key').value;
      const request = controller().connect(baseUrl, key);
      $('redmine-key').value = '';
      const success = await request;
      $('connection-feedback').textContent = success ? 'Connected. Your tasks are saved locally.' : 'Connection was not changed. Check the message below.';
    };
    $('disconnect-redmine').onclick = async () => {
      if (await controller().disconnect()) $('connection-feedback').textContent = 'Disconnected. Cached tasks were kept.';
    };
    $('refresh-tasks').onclick = () => controller().refresh();
  }
  $('error').onclick = () => { $('error').hidden = true; };
  function render(snapshot) {
    lastSnapshot = snapshot;
    if (!$('task-list')) return;
    const { connection, sync, tasks } = snapshot;
    if (connection && configuredServer !== connection.baseUrl) {
      $('redmine-url').value = connection.baseUrl;
      configuredServer = connection.baseUrl;
    }
    $('connection-status').textContent = connection
      ? connection.userName + (connection.connected ? ' · Connected' : ' · Disconnected; cached tasks')
      : 'Connect Redmine in Settings to import your tasks.';
    const last = connection?.lastSynced ? 'Last synced ' + new Date(connection.lastSynced * 1000).toLocaleTimeString() : 'Not synced yet';
    $('sync-status').textContent = sync.phase === 'syncing' ? 'Syncing…' : (sync.message ? sync.message + ' · ' : '') + last;
    if (sync.retryAt) $('sync-status').textContent += ' · Retry after ' + new Date(sync.retryAt * 1000).toLocaleTimeString();
    $('refresh-tasks').disabled = !connection?.connected || connectionBusy || ['syncing', 'auth-error', 'rate-limited'].includes(sync.phase);
    $('disconnect-redmine').disabled = !connection?.connected || connectionBusy;
    $('connect-redmine').textContent = connectionBusy ? 'Checking connection…' : connection?.connected ? 'Update connection' : 'Connect Redmine';
    $('connect-redmine').disabled = connectionBusy;
    $('task-empty').hidden = tasks.length > 0;
    $('task-empty').textContent = connection?.connected ? 'No open assigned tickets. Orbit checks every 20 seconds.' : 'Your tasks will appear here after connecting.';
    const ids = new Set(tasks.map(task => task.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
    for (const task of tasks) {
      let row = rows.get(task.id);
      if (!row) {
        row = document.createElement('button'); row.type = 'button'; row.className = 'task-row';
        row.append(document.createElement('strong'), document.createElement('small'));
        row.onclick = () => selectTask(task.id);
        rows.set(task.id, row); $('task-list').append(row);
      }
      row.firstChild.textContent = '#' + task.externalId + ' · ' + task.title;
      row.lastChild.textContent = stateLabel(task.state) + (task.project ? ' · ' + task.project : '') + (!task.upstreamPresent ? ' · No longer in open assignments' : '');
      row.dataset.state = task.state;
      row.setAttribute('aria-pressed', String(selectedId() === task.id));
    }
  }
  return {
    render,
    selected() { if (lastSnapshot) render(lastSnapshot); },
    busy(id, value) {
      if (id === 'connection') {
        connectionBusy = value;
        for (const input of document.querySelectorAll('#connection-form input, #connect-redmine')) input.disabled = value;
        if (lastSnapshot) render(lastSnapshot);
      }
      if (id === 'preferences') for (const input of document.querySelectorAll('#motion-panel input, #motion-panel select, #pause, #labels-toggle')) input.disabled = value;
    },
    error(message) { $('error').textContent = message; $('error').hidden = !message; },
  };
}
