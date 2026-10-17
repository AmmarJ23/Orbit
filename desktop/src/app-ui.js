import { stateLabel, statePill } from './task-labels.js';

const $ = id => document.getElementById(id);
// Side cards are a summary; the Tasks tab holds the full list.
const CARD_ROWS = 8;
const stateOrder = { 'in-progress': 0, 'not-started': 1, completed: 2 };
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
  for (const scroller of [document.querySelector('.sources'), ...cards]) fadeOverflow(scroller);
}

// Fades content into the scene on whichever edge has more to scroll. The fade
// grows with the distance left to scroll, so it eases in rather than popping.
const FADE = 26, MASK_PAD = 64;
function fadeOverflow(scroller) {
  const update = () => {
    const hidden = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const topFade = Math.min(FADE, scroller.scrollTop), bottomFade = Math.min(FADE, hidden - scroller.scrollTop);
    const view = scroller.getBoundingClientRect(), top = view.top + scroller.clientTop, bottom = top + scroller.clientHeight;
    for (const child of scroller.children) {
      const box = child.getBoundingClientRect();
      const cutTop = topFade > 0.5 && box.top < top + topFade, cutBottom = bottomFade > 0.5 && box.bottom > bottom - bottomFade;
      child.classList.toggle('edge-fade', cutTop || cutBottom);
      if (!cutTop && !cutBottom) continue;
      const start = top - box.top + MASK_PAD, end = bottom - box.top + MASK_PAD;
      child.style.setProperty('--fade-a', (cutTop ? start : 0) + 'px');
      child.style.setProperty('--fade-b', (cutTop ? start + topFade : 0) + 'px');
      child.style.setProperty('--fade-c', (cutBottom ? end - bottomFade : 1e5) + 'px');
      child.style.setProperty('--fade-d', (cutBottom ? end : 1e5) + 'px');
    }
  };
  scroller.addEventListener('scroll', update, { passive: true });
  const resize = new ResizeObserver(update);
  resize.observe(scroller);
  const watch = () => { for (const child of scroller.children) resize.observe(child); };
  new MutationObserver(() => { watch(); update(); }).observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  watch(); update();
}

export function createAppUI({ controller, selectTask, selectedId, switchSystem, openTasks }) {
  const rows = new Map();
  let lastSnapshot;
  let configuredServer;
  let menuTask = null;
  let shownSystem = 'active';
  setupSourceRail();
  const systemButtons = [...document.querySelectorAll('.system-switch [data-system]')];
  for (const button of systemButtons) button.onclick = () => switchSystem(button.dataset.system);
  function pressSystem(system, travelling) {
    for (const button of systemButtons) button.setAttribute('aria-pressed', String(button.dataset.system === system));
    document.querySelector('.system-switch').setAttribute('aria-busy', String(travelling));
  }
  function renderSystem() {
    const tasks = (lastSnapshot?.tasks ?? []).filter(task => !task.hidden);
    const completed = shownSystem === 'completed';
    $('system-title').textContent = completed ? 'Your completed system' : 'Your active system';
    const done = tasks.filter(task => task.state === 'completed');
    if (completed) {
      const fromSource = source => done.filter(task => (task.source ?? 'Redmine') === source).length;
      $('system-counts').textContent = `${done.length} completed · ${fromSource('Redmine')} Redmine · ${fromSource('ClickUp')} ClickUp`;
    } else {
      const active = tasks.filter(task => task.state === 'in-progress').length;
      const waiting = tasks.filter(task => task.state === 'not-started').length;
      $('system-counts').textContent = `${active} in progress · ${waiting} not started`;
    }
    $('completed-count').textContent = `${done.length} ${done.length === 1 ? 'task' : 'tasks'}`;
    for (const item of document.querySelectorAll('.legend [data-system]')) item.hidden = item.dataset.system !== shownSystem;
  }
  // Element ids per source; Redmine keeps the ids it had before ClickUp existed.
  const sources = {
    Redmine: {
      dialog: 'connect-dialog', form: 'connection-form', key: 'redmine-key', toggle: 'toggle-key', cancel: 'cancel-connect', submit: 'connect-redmine',
      open: 'open-connect', edit: 'edit-connection', disconnect: 'disconnect-redmine', refresh: 'refresh-tasks', status: 'connection-status',
      sync: 'sync-status', summary: 'connection-summary', feedback: 'connection-feedback', empty: 'task-empty', list: 'task-list', count: 'redmine-count',
      reads: 'open assigned Redmine tickets', nothing: 'No open assigned tickets.', hidden: 'redmine-hidden',
    },
    ClickUp: {
      dialog: 'clickup-dialog', form: 'clickup-form', key: 'clickup-key', toggle: 'clickup-toggle-key', cancel: 'clickup-cancel', submit: 'clickup-connect',
      open: 'clickup-open-connect', edit: 'clickup-edit-connection', disconnect: 'clickup-disconnect', refresh: 'clickup-refresh', status: 'clickup-connection-status',
      sync: 'clickup-sync-status', summary: 'clickup-summary', feedback: 'clickup-feedback', empty: 'clickup-empty', list: 'clickup-list', count: 'clickup-count',
      reads: 'open assigned ClickUp tasks', nothing: 'No open assigned tasks.', hidden: 'clickup-hidden',
    },
  };
  const live = !!$('connect-dialog');
  const busySources = new Set();
  // ClickUp setup is two steps when the token sees several workspaces: list, then choose.
  async function connectDetails(source) {
    const ids = sources[source];
    const apiKey = $(ids.key).value;
    if (source === 'Redmine') return { baseUrl: $('redmine-url').value, apiKey };
    const field = $('clickup-workspace-field');
    if (!field.hidden) return { apiKey, workspaceId: $('clickup-workspace').value };
    const workspaces = await controller().listWorkspaces(source, apiKey);
    if (!workspaces) return null;
    if (workspaces.length <= 1) return { apiKey, workspaceId: workspaces[0]?.id ?? null };
    $('clickup-workspace').replaceChildren(...workspaces.map(w => new Option(w.name, w.id)));
    field.hidden = false;
    $(ids.submit).textContent = 'Connect workspace';
    $('clickup-workspace').focus();
    return null;
  }
  for (const [source, ids] of live ? Object.entries(sources) : []) {
    const dialog = $(ids.dialog);
    const openConnect = () => { if (!dialog.open) dialog.showModal(); $(ids.key).focus(); };
    $(ids.open).onclick = openConnect;
    $(ids.edit).onclick = openConnect;
    $(ids.cancel).onclick = () => dialog.close();
    $(ids.toggle).onclick = () => {
      const show = $(ids.key).type === 'password';
      $(ids.key).type = show ? 'text' : 'password';
      $(ids.toggle).textContent = show ? 'Hide' : 'Show';
      $(ids.toggle).setAttribute('aria-pressed', String(show));
    };
    dialog.addEventListener('close', () => {
      $(ids.key).value = ''; $(ids.key).type = 'password'; $(ids.toggle).textContent = 'Show';
      if (source === 'ClickUp') { $('clickup-workspace-field').hidden = true; $('clickup-workspace').replaceChildren(); }
      if (lastSnapshot) render(lastSnapshot);
    });
    $(ids.form).onsubmit = async event => {
      event.preventDefault();
      const details = await connectDetails(source);
      if (!details) return;
      const request = controller().connect(source, details);
      $(ids.key).value = '';
      const success = await request;
      if (success) dialog.close();
      else if (source === 'ClickUp') { $('clickup-workspace-field').hidden = true; $('clickup-workspace').replaceChildren(); }
      $(ids.feedback).textContent = success ? 'Connected. Your tasks are saved locally.' : 'Connection was not changed. Check the message below.';
    };
    $(ids.disconnect).onclick = async () => {
      if (await controller().disconnect(source)) $(ids.feedback).textContent = 'Disconnected. Cached tasks were kept.';
    };
    $(ids.refresh).onclick = () => controller().refresh(source);
  }
  $('error').onclick = () => { $('error').hidden = true; };

  const menu = $('task-menu');
  const closeMenu = () => { menu.hidden = true; menuTask = null; };
  function openMenu(task, button) {
    menuTask = task;
    menu.querySelector('[data-action=orbit]').textContent = task.state === 'in-progress' ? 'Return to waiting ring' : 'Enter orbit';
    menu.querySelector('[data-action=orbit]').hidden = task.state === 'completed';
    menu.querySelector('[data-action=complete]').hidden = task.state === 'completed';
    menu.querySelector('[data-action=reopen]').hidden = task.state !== 'completed';
    menu.querySelector('[data-action=resume]').hidden = task.state !== 'completed';
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
    if (action === 'reopen') controller().setState(task.id, 'not-started');
    if (action === 'resume') controller().setState(task.id, 'in-progress');
    if (action === 'open') controller().openSource(task.id);
    if (action === 'hide') controller().setHidden([task.id], true);
  };
  for (const button of document.querySelectorAll('[data-manage]')) button.onclick = () => openTasks(button.dataset.manage);
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
      const pill = statePill(task.state);
      const more = Object.assign(document.createElement('button'), { type: 'button', className: 'more', textContent: '⋯' });
      more.setAttribute('aria-haspopup', 'menu');
      more.onclick = () => openMenu(item.task, more);
      item.append(select, pill, more);
      rows.set(task.id, item);
    }
    item.task = task;
    const title = task.id.startsWith('demo:') || task.source === 'ClickUp' ? (task.parentId ? '↳ ' : '') + task.title : '#' + task.externalId + ' ' + task.title;
    item.querySelector('.task-row span').textContent = title;
    item.querySelector('.task-row').title = title + (task.project ? ' · ' + task.project : '') + (!task.upstreamPresent ? ' · No longer in open assignments' : '');
    item.querySelector('.pill').textContent = task.state === 'not-started' ? '' : stateLabel(task.state);
    item.querySelector('.more').setAttribute('aria-label', 'Actions for ' + task.title);
    item.dataset.state = task.state;
    item.dataset.selected = String(selectedId() === task.id);
    return item;
  }

  function renderSource(source, ids, tasks, info) {
    const all = tasks.filter(task => (task.source ?? 'Redmine') === source);
    // Hidden tasks are managed in the Tasks tab; the card only says how many there are.
    const own = all.filter(task => !task.hidden);
    const hiddenCount = all.length - own.length;
    // In-progress work first; the selected task always stays in view.
    const ordered = own.slice().sort((a, b) => stateOrder[a.state] - stateOrder[b.state]);
    const shown = ordered.slice(0, CARD_ROWS);
    const chosen = ordered.find(task => task.id === selectedId());
    if (chosen && !shown.includes(chosen)) shown.push(chosen);
    const rest = own.length - shown.length;
    $(ids.hidden).hidden = !rest && !hiddenCount;
    $(ids.hidden).textContent = [rest ? `${rest} more` : '', hiddenCount ? `${hiddenCount} hidden` : ''].filter(Boolean).join(' · ') + ' · Open in Tasks';
    $(ids.list).replaceChildren(...shown.map(row));
    $(ids.count).textContent = own.filter(task => task.state !== 'completed').length || '';
    $(ids.empty).hidden = all.length > 0;
    if (!live) { $(ids.empty).textContent = `No ${source} sample tasks.`; return; }
    const { connection, sync } = info ?? { connection: null, sync: { phase: 'idle' } };
    const busy = busySources.has(source);
    if (source === 'Redmine' && connection && configuredServer !== connection.baseUrl) {
      $('redmine-url').value = connection.baseUrl;
      configuredServer = connection.baseUrl;
    }
    const connected = !!connection?.connected;
    const where = connection?.workspaceName ?? connection?.baseUrl;
    $(ids.status).hidden = !connection;
    $(ids.status).textContent = connection ? connection.userName + (connected ? ' · Connected' : ' · Disconnected; cached tasks') : '';
    const last = connection?.lastSynced ? 'Last synced ' + new Date(connection.lastSynced * 1000).toLocaleTimeString() : '';
    let syncText = sync.phase === 'syncing' ? 'Syncing…' : [sync.message, last].filter(Boolean).join(' · ');
    if (sync.retryAt) syncText += ' · Retry after ' + new Date(sync.retryAt * 1000).toLocaleTimeString();
    $(ids.sync).textContent = connection ? syncText : '';
    $(ids.refresh).hidden = !connected;
    $(ids.refresh).disabled = busy || ['syncing', 'auth-error', 'rate-limited'].includes(sync.phase);
    $(ids.disconnect).hidden = !connected;
    $(ids.disconnect).disabled = busy;
    $(ids.open).hidden = connected;
    $(ids.open).textContent = (connection ? 'Reconnect ' : 'Connect ') + source;
    $(ids.edit).textContent = connected ? 'Update connection' : 'Connect ' + source;
    $(ids.summary).textContent = connection ? `${where} · ${connection.userName}${connected ? '' : ' (disconnected)'}` : `Not connected. Orbit reads your ${ids.reads}.`;
    const choosing = source === 'ClickUp' && !$('clickup-workspace-field').hidden;
    $(ids.submit).textContent = busy ? 'Checking connection…' : choosing ? 'Connect workspace' : 'Connect ' + source;
    $(ids.submit).disabled = busy;
    $(ids.empty).textContent = connected ? `${ids.nothing} Orbit checks every 20 seconds.` : `Connect ${source} to bring your ${ids.reads.replace('open assigned ', 'open ')} into orbit.`;
  }
  function render(snapshot) {
    lastSnapshot = snapshot;
    const { tasks } = snapshot;
    const ids = new Set(tasks.map(task => task.id));
    for (const [id, item] of rows) if (!ids.has(id)) { item.remove(); rows.delete(id); }
    for (const [source, sourceIds] of Object.entries(sources)) renderSource(source, sourceIds, tasks, snapshot.sources?.[source]);
    renderSystem();
  }
  return {
    render,
    pressSystem,
    showSystem(system) { shownSystem = system; renderSystem(); },
    selected() { if (lastSnapshot) render(lastSnapshot); },
    busy(id, value) {
      if (id.startsWith('connection:')) {
        const source = id.slice('connection:'.length);
        value ? busySources.add(source) : busySources.delete(source);
        for (const input of document.querySelectorAll(`#${sources[source].form} input, #${sources[source].form} select`)) input.disabled = value;
        if (lastSnapshot) render(lastSnapshot);
      }
      if (id === 'preferences') for (const input of document.querySelectorAll('#motion-panel input, #motion-panel select, #pause, #labels-toggle')) input.disabled = value;
    },
    error(message) { $('error').textContent = message; $('error').hidden = !message; },
  };
}
