// Tasks tab: every task grouped by source, then list/project, nested by parent the way
// ClickUp organises subtasks. Hiding is private to Orbit: hidden tasks leave the scene
// and the side cards but stay here, dimmed, until revealed.
const $ = id => document.getElementById(id);
const stateLabel = state => ({ 'not-started': 'To do', 'in-progress': 'Doing', completed: 'Done' })[state] ?? state;

export function createTasksView({ controller, focusTask }) {
  const view = $('tasks-view');
  const collapsed = new Set();
  let tasks = [];
  let byId = new Map();
  let open = false;
  let showHidden = true;
  let filter = 'all';
  let query = '';

  function setOpen(value) {
    open = value;
    view.hidden = !value;
    document.body.classList.toggle('tasks-open', value);
    for (const button of document.querySelectorAll('.nav-tabs [data-view]')) {
      if (button.dataset.view === (value ? 'tasks' : 'overview')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    if (value) { draw(); $('tasks-search').focus(); }
  }
  for (const button of document.querySelectorAll('.nav-tabs [data-view]')) button.onclick = () => setOpen(button.dataset.view === 'tasks');
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && open && !document.querySelector('dialog[open]')) setOpen(false); });
  $('tasks-search').oninput = event => { query = event.target.value.trim().toLowerCase(); draw(); };
  $('tasks-show-hidden').onchange = event => { showHidden = event.target.checked; draw(); };
  for (const button of document.querySelectorAll('#tasks-filter [data-filter]')) {
    button.onclick = () => {
      filter = button.dataset.filter;
      for (const other of document.querySelectorAll('#tasks-filter [data-filter]')) other.setAttribute('aria-pressed', String(other === button));
      draw();
    };
  }

  // Subtasks whose parent is not assigned to you have nothing to nest under; they sit at the top.
  function tree(list) {
    const ids = new Set(list.map(task => task.id));
    const children = new Map();
    const roots = [];
    for (const task of list) {
      const parent = task.parentId && task.id.slice(0, task.id.lastIndexOf('|') + 1) + task.parentId;
      if (parent && ids.has(parent) && parent !== task.id) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(task);
      } else roots.push(task);
    }
    return { roots, children };
  }
  const branchIds = (task, children) => [task.id, ...(children.get(task.id) ?? []).flatMap(child => branchIds(child, children))];
  const matches = task => !query || task.title.toLowerCase().includes(query) || task.externalId.toLowerCase().includes(query);

  function eye(ids, hidden, label, text = null) {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'quiet eye', textContent: text ?? (hidden ? 'Show' : 'Hide') });
    button.setAttribute('aria-label', (hidden ? 'Show ' : 'Hide ') + label);
    button.onclick = () => controller().setHidden(ids, !hidden);
    return button;
  }
  // `children` is the full nesting (used for counts and branch hiding); `shown` is what
  // survives the search and hidden filters.
  function taskRow(task, children, shown, depth) {
    const kids = children.get(task.id) ?? [];
    const visibleKids = shown.get(task.id) ?? [];
    const li = document.createElement('li');
    const row = Object.assign(document.createElement('div'), { className: 'tree-row' });
    row.style.setProperty('--depth', depth);
    row.dataset.state = task.state;
    row.dataset.hidden = String(!!task.hidden);
    const caret = Object.assign(document.createElement('button'), { type: 'button', className: 'caret' });
    caret.hidden = visibleKids.length === 0;
    caret.setAttribute('aria-expanded', String(!collapsed.has(task.id)));
    caret.setAttribute('aria-label', (collapsed.has(task.id) ? 'Expand ' : 'Collapse ') + task.title);
    caret.onclick = () => { collapsed.has(task.id) ? collapsed.delete(task.id) : collapsed.add(task.id); draw(); };
    const title = Object.assign(document.createElement('button'), { type: 'button', className: 'tree-title' });
    title.append(Object.assign(document.createElement('i'), { className: 'dot' }),
      Object.assign(document.createElement('span'), { textContent: (task.source === 'Redmine' ? '#' + task.externalId + ' ' : '') + task.title }));
    title.title = task.hidden ? 'Hidden from the scene' : 'Show in orbit';
    title.disabled = task.hidden;
    title.onclick = () => { setOpen(false); focusTask(task.id); };
    const meta = Object.assign(document.createElement('span'), { className: 'tree-meta', textContent: [kids.length ? `${kids.length} subtask${kids.length === 1 ? '' : 's'}` : '', task.priority ?? ''].filter(Boolean).join(' · ') });
    const pill = Object.assign(document.createElement('span'), { className: 'pill', textContent: stateLabel(task.state) });
    row.append(caret, title, meta, pill);
    // A parent offers its whole branch as well as itself, matching ClickUp's nesting.
    if (kids.length) {
      const ids = branchIds(task, children);
      const allHidden = ids.every(id => byId.get(id)?.hidden);
      row.append(eye(ids, allHidden, task.title + ' and its subtasks', allHidden ? 'Show all' : 'Hide all'));
    }
    row.append(eye([task.id], task.hidden, task.title, kids.length ? (task.hidden ? 'Show task' : 'Hide task') : null));
    li.append(row);
    if (visibleKids.length && !collapsed.has(task.id)) {
      const ul = document.createElement('ul');
      ul.append(...visibleKids.map(kid => taskRow(kid, children, shown, depth + 1)));
      li.append(ul);
    }
    return li;
  }
  // Keep a branch when anything inside it matches, so a found subtask keeps its parent.
  function prune(task, children, shown) {
    const kids = (children.get(task.id) ?? []).filter(kid => prune(kid, children, shown));
    shown.set(task.id, kids);
    return (showHidden || !task.hidden) && (matches(task) || kids.length > 0);
  }

  function draw() {
    if (!open) return;
    const sections = [];
    let listed = 0;
    for (const source of ['Redmine', 'ClickUp']) {
      if (filter !== 'all' && filter !== source) continue;
      const own = tasks.filter(task => (task.source ?? 'Redmine') === source);
      if (!own.length) continue;
      const groups = new Map();
      for (const task of own) {
        const key = task.project ?? 'No list';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(task);
      }
      const section = document.createElement('section');
      section.className = 'tasks-source';
      const hiddenCount = own.filter(task => task.hidden).length;
      section.append(Object.assign(document.createElement('h3'), { textContent: `${source} · ${own.length} task${own.length === 1 ? '' : 's'}${hiddenCount ? ` · ${hiddenCount} hidden` : ''}` }));
      for (const [name, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
        const { roots, children } = tree(list);
        const shown = new Map();
        const kept = roots.filter(task => prune(task, children, shown));
        if (!kept.length) continue;
        const key = source + '|' + name;
        const group = Object.assign(document.createElement('div'), { className: 'tasks-group' });
        const head = Object.assign(document.createElement('div'), { className: 'group-head' });
        const caret = Object.assign(document.createElement('button'), { type: 'button', className: 'caret' });
        caret.setAttribute('aria-expanded', String(!collapsed.has(key)));
        caret.setAttribute('aria-label', (collapsed.has(key) ? 'Expand ' : 'Collapse ') + name);
        caret.onclick = () => { collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key); draw(); };
        const allHidden = list.every(task => task.hidden);
        head.append(caret, Object.assign(document.createElement('strong'), { textContent: name }),
          Object.assign(document.createElement('span'), { className: 'tree-meta', textContent: `${list.length}` }),
          eye(list.map(task => task.id), allHidden, 'every task in ' + name, allHidden ? 'Show list' : 'Hide list'));
        group.append(head);
        if (!collapsed.has(key)) {
          const ul = Object.assign(document.createElement('ul'), { className: 'tree' });
          ul.append(...kept.map(task => taskRow(task, children, shown, 0)));
          group.append(ul);
        }
        listed += kept.length;
        section.append(group);
      }
      sections.push(section);
    }
    const hidden = tasks.filter(task => task.hidden).length;
    $('tasks-summary').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${tasks.length - hidden} in the scene · ${hidden} hidden`;
    $('tasks-empty').hidden = listed > 0;
    $('tasks-empty').textContent = tasks.length ? 'No tasks match.' : 'No tasks yet. Connect Redmine or ClickUp in Settings.';
    // Keep the reader's place across the redraws every sync triggers.
    const body = $('tasks-body');
    const scroll = body.scrollTop;
    body.replaceChildren(...sections);
    body.scrollTop = scroll;
  }
  return {
    render(snapshot) { tasks = snapshot.tasks; byId = new Map(tasks.map(task => [task.id, task])); draw(); },
    open: () => setOpen(true),
  };
}
