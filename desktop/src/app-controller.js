export const defaultPreferences = { labels: true, stars: true, speed: 1, paused: false, frameLimit: 60, resolution: 1.5, nebula: true, rocks: true, completionPreview: true, blackSky: false, transition: 'glide', redmineVpn: null,
  noteColors: 'palette', probeStyle: 'dish', dockStyle: 'ring', probeReturn: 'flight', probeBlink: true, planetNotes: 'chips', collapsedCards: 'icon', notesView: { layout: 'list', sort: 'edited', descending: true, editor: 'rich' } };

// Own hydration/visibility ordering independently of DOM, Three.js and IPC.
export function createAppController({ repository, view }) {
  const visibility = new Map([['native', false], ['document', true]]);
  let snapshot = null;
  let ready = false;
  let hydrating = true;
  let epoch = 0;
  let queued = null;
  let preferenceQueue = Promise.resolve();
  const visible = () => [...visibility.values()].every(Boolean);
  function apply(next, { settle = false, animate = false } = {}) {
    if (snapshot && (next.revision < snapshot.revision || (next.revision === snapshot.revision && !settle))) return;
    snapshot = next;
    view.applySnapshot(next, { settle, animate: animate && visible() && !hydrating });
  }
  function receive(event) {
    if (hydrating) {
      if (!queued || event.snapshot.revision > queued.snapshot.revision) queued = event;
      return;
    }
    apply(event.snapshot, { settle: !visible(), animate: event.animate });
  }
  async function hydrate(token) {
    hydrating = true;
    view.setVisible(false);
    try {
      const next = await repository.getSnapshot();
      if (token !== epoch && ready) return;
      apply(next, { settle: true });
      if (queued) { apply(queued.snapshot, { settle: true }); queued = null; }
      hydrating = false;
      ready = true;
      view.setVisible(visible());
    } catch (error) {
      if (token !== epoch) return;
      hydrating = false;
      // If a previous snapshot exists, cached rendering can still resume safely.
      view.error(String(error.message ?? error));
      if (snapshot) { view.settle(); view.setVisible(visible()); }
    }
  }
  async function start() {
    await repository.subscribe(receive);
    await hydrate(++epoch);
  }
  async function setVisibility(source, value) {
    const wasVisible = visible();
    visibility.set(source, value);
    const isVisible = visible();
    if (!isVisible) {
      ++epoch;
      hydrating = false;
      view.setVisible(false);
      view.settle();
    } else if (!wasVisible && ready) {
      await hydrate(++epoch);
    } else if (ready && !hydrating) {
      view.setVisible(true);
    }
  }
  async function operation(action, id, { animate = false, settle = false } = {}) {
    view.busy?.(id, true);
    try {
      const result = await action();
      if (result) apply(result, { settle: settle || !visible(), animate });
      view.error('');
      return true;
    } catch (error) {
      if (snapshot) view.applySnapshot(snapshot, { animate: false, settle: false });
      view.error(String(error.message ?? error)); return false;
    }
    finally { view.busy?.(id, false); }
  }
  function savePreferences(patch) {
    preferenceQueue = preferenceQueue.then(() => operation(() => repository.savePreferences({ ...snapshot.preferences, ...patch }), 'preferences'));
    return preferenceQueue;
  }
  return {
    start, setVisibility, receive, get snapshot() { return snapshot; }, get visible() { return visible() && ready && !hydrating; },
    setState: (id, state) => operation(() => repository.setState(id, state), id, { animate: true }),
    setHidden: (ids, hidden) => operation(() => repository.setHidden(ids, hidden), 'hidden', { animate: true }),
    savePreferences,
    connect: (source, details) => operation(() => repository.connect(source, details), 'connection:' + source, { settle: true }),
    // Returns the workspaces, or null after showing the error.
    async listWorkspaces(source, apiKey) {
      let list = null;
      await operation(async () => { list = await repository.listWorkspaces(source, apiKey); }, 'connection:' + source);
      return list;
    },
    disconnect: source => operation(() => repository.disconnect(source), 'connection:' + source),
    refresh: source => operation(() => repository.refresh(source), 'refresh'),
    openSource: id => operation(() => repository.openSource(id), 'source'),
    listVpns: () => repository.listVpns().catch(() => []),
    // Note text saves never animate; links, pins and deletes move probes.
    saveNote: (id, title, body) => operation(() => repository.saveNote(id, title, body), 'note'),
    setNotePinned: (id, pinned) => operation(() => repository.setNotePinned(id, pinned), 'note', { animate: true }),
    setNoteLinks: (id, links) => operation(() => repository.setNoteLinks(id, links), 'note', { animate: true }),
    deleteNote: id => operation(() => repository.deleteNote(id), 'note', { animate: true }),
  };
}
