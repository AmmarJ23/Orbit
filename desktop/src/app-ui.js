const $ = id => document.getElementById(id);
const stateLabel = state => ({ 'not-started': 'Not started', 'in-progress': 'In progress', completed: 'Done' })[state];
const narrow = () => matchMedia('(max-width: 1279px)').matches;

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
  return { showFirst: () => show(tabs[0]) };
}

// The rail only collapses on narrow windows; wide windows always show every card.
function setupSourceRail() {
  const cards = [...document.querySelectorAll('.source-card')];
  for (const card of cards) {
    const head = card.querySelector('.card-head');
    head.onclick = () => {
      if (!narrow()) return;
      const open = !card.classList.contains('expanded');
      for (const other of cards) { other.classList.remove('expanded'); other.querySelector('.card-head').setAttribute('aria-expanded', 'false'); }
      card.classList.toggle('expanded', open);
      head.setAttribute('aria-expanded', String(open));
    };
  }
  const sync = () => { for (const card of cards) card.querySelector('.card-head').setAttribute('aria-expanded', String(!narrow() || card.classList.contains('expanded'))); };
  addEventListener('resize', sync); sync();
  document.addEventListener('pointerdown', event => {
    if (narrow() && !event.target.closest('.sources, #task-menu')) for (const card of cards) card.classList.remove('expanded');
  });
}

export function createAppUI({ controller, selectTask, selectedId }) {
  const rows = new Map();
  let connectionBusy = false;
  let lastSnapshot;
  let configuredServer;
  let menuTask = null;
  setupSourceRail();
  const dialog = $('connect-dialog');
  const openConnect = () => { if (!dialog.open) dialog.showModal(); $('redmine-key').focus(); };
  if (dialog) {
    $('open-connect').onclick = openConnect;
    $('edit-connection').onclick = openConnect;
    $('cancel-connect').onclick = () => dialog.close();
    $('toggle-key').onclick = () => {
      const show = $('redmine-key').type === 'password';
      $('redmine-key').type = show ? 'text' : 'password';
      $('toggle-key').textContent = show ? 'Hide' : 'Show';
      $('toggle-key').setAttribute('aria-pressed', String(show));
    };
    dialog.addEventListener('close', () => { $('redmine-key').value = ''; $('redmine-key').type = 'password'; $('toggle-key').textContent = 'Show'; });
    $('connection-form').onsubmit = async event => {
      event.preventDefault();
      const request = controller().connect($('redmine-url').value, $('redmine-key').value);
      $('redmine-key').value = '';
      const success = await request;
      if (success) dialog.close();
      $('connection-feedback').textContent = success ? 'Connected. Your tasks are saved locally.' : 'Connection was not changed. Check the message below.';
    };
    $('disconnect-redmine').onclick = async () => {
      if (await controller().disconnect()) $('connection-feedback').textContent = 'Disconnected. Cached tasks were kept.';
    };
    $('refresh-tasks').onclick = () => controller().refresh();
  }
  $('error').onclick = () => { $('error').hidden = true; };

  const menu = $('task-menu');
  const closeMenu = () => { menu.hidden = true; menuTask = null; };
  function openMenu(task, button) {
    menuTask = task;
    menu.querySelector('[data-action=orbit]').textContent = task.state === 'in-progress' ? 'Return to waiting ring' : 'Enter orbit';
    menu.querySelector('[data-action=orbit]').hidden = task.state === 'completed';
    menu.querySelector('[data-action=complete]').hidden = task.state === 'completed';
    menu.querySelector('[data-action=open]').hidden = !task.url;
    menu.hidden = false;
    const r = button.getBoundingClientRect();
    menu.style.left = Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top = Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8) + 'px';
    menu.querySelector('button:not([hidden])')?.focus();
  }
  menu.onclick = event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const task = menuTask;
    closeMenu();
    if (!task || !action) return;
    if (action === 'orbit') controller().setState(task.id, task.state === 'in-progress' ? 'not-started' : 'in-progress');
    if (action === 'complete') controller().setState(task.id, 'completed');
    if (action === 'open') controller().openSource(task.id);
  };
  document.addEventListener('pointerdown', event => { if (!menu.hidden && !event.target.closest('#task-menu, .more')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) closeMenu(); });

  function row(task) {
    let item = rows.get(task.id);
    if (!item) {
      item = document.createElement('li');
      const select = document.createElement('button');
      select.type = 'button'; select.className = 'task-row';
      select.append(Object.assign(document.createElement('i'), { className: 'dot' }), document.createElement('span'));
      select.onclick = () => selectTask(task.id);
      const pill = Object.assign(document.createElement('span'), { className: 'pill' });
      const more = Object.assign(document.createElement('button'), { type: 'button', className: 'more', textContent: '⋯' });
      more.setAttribute('aria-haspopup', 'menu');
      more.onclick = () => openMenu(item.task, more);
      item.append(select, pill, more);
      rows.set(task.id, item);
    }
    item.task = task;
    const title = task.id.startsWith('demo:') ? task.title : '#' + task.externalId + ' ' + task.title;
    item.querySelector('.task-row span').textContent = title;
    item.querySelector('.task-row').title = title + (task.project ? ' · ' + task.project : '') + (!task.upstreamPresent ? ' · No longer in open assignments' : '');
    item.querySelector('.pill').textContent = stateLabel(task.state);
    item.querySelector('.more').setAttribute('aria-label', 'Actions for ' + task.title);
    item.dataset.state = task.state;
    item.dataset.selected = String(selectedId() === task.id);
    return item;
  }

  function render(snapshot) {
    lastSnapshot = snapshot;
    const { connection, sync, tasks } = snapshot;
    const ids = new Set(tasks.map(task => task.id));
    for (const [id, item] of rows) if (!ids.has(id)) { item.remove(); rows.delete(id); }
    for (const [source, list, count] of [['Redmine', 'task-list', 'redmine-count'], ['ClickUp', 'clickup-list', 'clickup-count']]) {
      const own = tasks.filter(task => (task.source ?? 'Redmine') === source);
      $(list).replaceChildren(...own.map(row));
      $(count).textContent = own.filter(task => task.state !== 'completed').length || '';
    }
    $('clickup-empty').hidden = tasks.some(task => task.source === 'ClickUp');
    const active = tasks.filter(task => task.state === 'in-progress').length;
    const waiting = tasks.filter(task => task.state === 'not-started').length;
    const done = tasks.filter(task => task.state === 'completed').length;
    $('system-counts').textContent = `${active} in progress · ${waiting} not started`;
    $('completed-count').textContent = `${done} ${done === 1 ? 'task' : 'tasks'}`;
    const redmineCount = tasks.filter(task => (task.source ?? 'Redmine') === 'Redmine').length;
    if (!dialog) {
      $('task-empty').hidden = redmineCount > 0;
      $('task-empty').textContent = 'No Redmine sample tasks.';
      return;
    }
    if (connection && configuredServer !== connection.baseUrl) {
      $('redmine-url').value = connection.baseUrl;
      configuredServer = connection.baseUrl;
    }
    const connected = !!connection?.connected;
    $('connection-status').hidden = !connection;
    $('connection-status').textContent = connection ? connection.userName + (connected ? ' · Connected' : ' · Disconnected; cached tasks') : '';
    const last = connection?.lastSynced ? 'Last synced ' + new Date(connection.lastSynced * 1000).toLocaleTimeString() : '';
    let syncText = sync.phase === 'syncing' ? 'Syncing…' : [sync.message, last].filter(Boolean).join(' · ');
    if (sync.retryAt) syncText += ' · Retry after ' + new Date(sync.retryAt * 1000).toLocaleTimeString();
    $('sync-status').textContent = connection ? syncText : '';
    $('refresh-tasks').hidden = !connected;
    $('refresh-tasks').disabled = connectionBusy || ['syncing', 'auth-error', 'rate-limited'].includes(sync.phase);
    $('disconnect-redmine').hidden = !connected;
    $('disconnect-redmine').disabled = connectionBusy;
    $('open-connect').hidden = connected;
    $('open-connect').textContent = connection ? 'Reconnect Redmine' : 'Connect Redmine';
    $('edit-connection').textContent = connected ? 'Update connection' : 'Connect Redmine';
    $('connection-summary').textContent = connection ? `${connection.baseUrl} · ${connection.userName}${connected ? '' : ' (disconnected)'}` : 'Not connected. Orbit reads your open assigned Redmine tickets.';
    $('connect-redmine').textContent = connectionBusy ? 'Checking connection…' : 'Connect Redmine';
    $('connect-redmine').disabled = connectionBusy;
    $('task-empty').hidden = redmineCount > 0;
    $('task-empty').textContent = connected ? 'No open assigned tickets. Orbit checks every 20 seconds.' : 'Connect Redmine to bring your open tickets into orbit.';
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
